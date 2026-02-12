/**
 * Mock Test CLI Command
 *
 * Runs integration tests with the mock Discord server.
 *
 * Usage:
 *   robo mock test [options]
 *
 * This command:
 * 1. Starts the mock server in test mode
 * 2. Sets environment variables for tests to connect
 * 3. Auto-detects and runs the test suite (Jest or Node)
 * 4. Tests use startMockRobo() to spawn their own bot instances
 * 5. Tracks sessions and results for UI display
 * 6. Keeps the server alive after tests for inspection
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createCliCommandConfig, color } from 'robo.js'
import { createRegistry, finalizeRegistry, readRegistry } from '../../../../session/registry.js'
import { STANDALONE_MOCK_PORT } from '../../../../utils/server-info.js'
import { mockLogger } from '../../../../core/logger.js'
import type { CliContext } from 'robo.js'

export const config = createCliCommandConfig({
	description: 'Run integration tests with mock Discord server',
	options: [
		{
			alias: '-p',
			name: '--port',
			description: 'Port to run the mock server on',
			type: 'number'
		},
		{
			alias: '-r',
			name: '--runner',
			description: 'Test runner to use: "jest" | "node" (auto-detect)',
			type: 'string'
		},
		{
			alias: '-t',
			name: '--timeout',
			description: 'Test timeout in seconds',
			type: 'number'
		},
		{
			alias: '-n',
			name: '--no-browser',
			description: 'Skip opening Stage UI after tests',
			type: 'boolean',
			default: false
		},
		{
			alias: '-v',
			name: '--verbose',
			description: 'Verbose debug output',
			type: 'boolean',
			default: false
		},
		{
			alias: '-w',
			name: '--watch',
			description: 'Keep server running after tests (default: true)',
			type: 'boolean',
			default: true
		}
	]
} as const)

export default async function mockTestCommand({ options, logger }: CliContext) {
	const port = (options.port as number | undefined) ?? STANDALONE_MOCK_PORT
	const runner = options.runner as string | undefined
	const timeout = (options.timeout as number | undefined) ?? 120
	const noBrowser = options['no-browser'] as boolean | undefined
	const verbose = options.verbose as boolean | undefined
	const watch = options.watch as boolean

	// Generate unique run ID
	const runId = `run_${randomBytes(8).toString('hex')}`

	// Configure logger
	if (verbose) {
		mockLogger.setup({ level: 'debug' })
	}

	logger.log('')
	logger.log(color.bold('  Mock Server Test Runner'))
	logger.log(color.dim('  ──────────────────────────────'))
	logger.log('')

	// Detect test runner
	const detectedRunner: 'jest' | 'node' = (runner === 'jest' || runner === 'node') ? runner : detectTestRunner()
	logger.info(`Detected test runner: ${color.cyan(detectedRunner)}`)

	// Create fresh test registry
	createRegistry(runId)
	logger.debug(`Created test registry: ${runId}`)

	// Set environment variables for mock server and tests
	// Note: We only set ROBO_MOCK_PORT, NOT PORT. This allows @robojs/server to use
	// its own port (default 3000) while the mock server runs on STANDALONE_MOCK_PORT (6625)
	process.env.ROBO_MOCK_TEST_MODE = 'true'
	process.env.ROBO_MOCK_TEST_RUN_ID = runId
	process.env.ROBO_MOCK_PORT = String(port)

	// Start mock server
	logger.info(`Starting mock server on port ${color.cyan(String(port))}...`)

	let mockServerProcess: ChildProcess | null = null

	try {
		// Start mock server in background
		mockServerProcess = await startMockServer(port, verbose)

		// Wait for server to be ready
		await waitForServer(port)
		logger.info(color.green('Mock server ready'))
		logger.log('')

		// Run tests - tests will use startMockRobo() to spawn their own bot instances
		logger.info('Running tests...')
		logger.info(color.dim('  (Tests use startMockRobo() to start bot instances)'))
		logger.log('')

		const testResult = await runTests(detectedRunner, timeout, verbose, port)

		// Finalize registry
		finalizeRegistry()

		// Display results
		displayResults(logger)

		// Show Stage UI if tests failed or if watch mode
		if (!noBrowser && (testResult.exitCode !== 0 || watch)) {
			const stageUrl = `http://localhost:${port}/mock/stage`
			logger.log('')
			logger.info(`Stage UI: ${color.cyan(stageUrl)}`)
		}

		if (watch) {
			logger.log('')
			logger.info(`Mock server running at ${color.cyan(`http://localhost:${port}`)}`)
			logger.log(color.dim('  Press Ctrl+C to exit'))
			logger.log('')

			// Keep process alive
			await new Promise<void>((resolve) => {
				const shutdown = () => {
					logger.log('')
					logger.info('Shutting down...')
					if (mockServerProcess) {
						mockServerProcess.kill()
					}
					resolve()
				}

				process.on('SIGINT', shutdown)
				process.on('SIGTERM', shutdown)
			})
		} else {
			// Clean shutdown
			if (mockServerProcess) {
				mockServerProcess.kill()
			}

			// Exit with test result code
			process.exit(testResult.exitCode)
		}
	} catch (error) {
		logger.error(`Test run failed: ${(error as Error).message}`)

		// Clean up
		if (mockServerProcess) {
			mockServerProcess.kill()
		}

		process.exit(1)
	}
}

/**
 * Detect which test runner to use
 */
function detectTestRunner(): 'jest' | 'node' {
	const cwd = process.cwd()

	// Check for Jest config files
	const jestConfigs = [
		'jest.config.js',
		'jest.config.ts',
		'jest.config.mjs',
		'jest.config.cjs',
		'jest.config.json'
	]

	for (const config of jestConfigs) {
		if (existsSync(join(cwd, config))) {
			return 'jest'
		}
	}

	// Check package.json for jest config
	try {
		const pkg = require(join(cwd, 'package.json'))
		if (pkg.jest) {
			return 'jest'
		}
		// Check if test script uses node --test
		if (pkg.scripts?.test?.includes('node --test')) {
			return 'node'
		}
	} catch {
		// No package.json
	}

	// Default to Jest
	return 'jest'
}

/**
 * Start the mock server
 */
async function startMockServer(port: number, verbose?: boolean): Promise<ChildProcess> {
	return new Promise((resolve, reject) => {
		const args = ['mock', 'start', '--port', String(port), '--no-browser']
		if (verbose) {
			args.push('--verbose')
		}

		const child = spawn('npx', ['robo', ...args], {
			stdio: ['ignore', 'pipe', 'pipe'],
			env: {
				...process.env,
				PORT: String(port),
				ROBO_MOCK_MODE: 'true',
				ROBO_MOCK_TEST_MODE: 'true',
				ROBO_MOCK_TEST_RUN_ID: process.env.ROBO_MOCK_TEST_RUN_ID
			}
		})

		let started = false

		child.stdout?.on('data', (data: Buffer) => {
			const output = data.toString()
			if (verbose) {
				process.stdout.write(color.dim(`[mock] ${output}`))
			}

			// Check if server is ready
			if (output.includes('Mock server running') || output.includes('Gateway WebSocket')) {
				started = true
				resolve(child)
			}
		})

		child.stderr?.on('data', (data: Buffer) => {
			if (verbose) {
				process.stderr.write(color.dim(`[mock] ${data.toString()}`))
			}
		})

		child.on('error', (error) => {
			if (!started) {
				reject(error)
			}
		})

		child.on('exit', (code) => {
			if (!started && code !== 0) {
				reject(new Error(`Mock server exited with code ${code}`))
			}
		})

		// Timeout for server startup
		setTimeout(() => {
			if (!started) {
				child.kill()
				reject(new Error('Mock server startup timeout'))
			}
		}, 30000)
	})
}

/**
 * Wait for the mock server to be ready
 */
async function waitForServer(port: number, timeout = 30000): Promise<void> {
	const startTime = Date.now()
	const url = `http://localhost:${port}/api/control/sessions`

	while (Date.now() - startTime < timeout) {
		try {
			const response = await fetch(url)
			if (response.ok) {
				return
			}
		} catch {
			// Server not ready yet
		}

		await new Promise((r) => setTimeout(r, 500))
	}

	throw new Error(`Server not ready after ${timeout}ms`)
}

/**
 * Run the test suite
 */
async function runTests(
	runner: 'jest' | 'node',
	timeout: number,
	verbose?: boolean,
	port?: number
): Promise<{ exitCode: number }> {
	return new Promise((resolve) => {
		let command: string
		let args: string[]

		if (runner === 'jest') {
			command = 'npx'
			args = ['jest', '--runInBand', '--forceExit']
			if (verbose) {
				args.push('--verbose')
			}
		} else {
			command = 'node'
			args = ['--test']
		}

		const child = spawn(command, args, {
			stdio: 'inherit',
			env: {
				...process.env,
				NODE_OPTIONS: '--experimental-vm-modules --disable-warning=ExperimentalWarning',
				ROBO_MOCK_TEST_MODE: 'true',
				ROBO_MOCK_TEST_RUN_ID: process.env.ROBO_MOCK_TEST_RUN_ID,
				ROBO_MOCK_PORT: port ? String(port) : undefined
			},
			shell: true
		})

		// Set timeout
		const timeoutId = setTimeout(() => {
			child.kill()
			mockLogger.warn(`Tests timed out after ${timeout}s`)
			resolve({ exitCode: 1 })
		}, timeout * 1000)

		child.on('exit', (code) => {
			clearTimeout(timeoutId)
			resolve({ exitCode: code ?? 0 })
		})

		child.on('error', (error) => {
			clearTimeout(timeoutId)
			mockLogger.error(`Test process error: ${error.message}`)
			resolve({ exitCode: 1 })
		})
	})
}

/**
 * Display test results summary
 */
function displayResults(logger: { log: (msg: string) => void; info: (msg: string) => void }): void {
	const registry = readRegistry()
	if (!registry) {
		logger.log(color.yellow('  No test results found'))
		return
	}

	// Session details with pass/fail counts
	logger.log('')
	logger.log(color.dim('  ──────────────────────────────────────────────────────────────'))
	logger.log(color.bold('  Sessions'))
	logger.log(color.dim('  ──────────────────────────────────────────────────────────────'))

	for (const file of registry.testFiles) {
		const passed = file.tests.filter((t) => t.status === 'passed').length
		const failed = file.tests.filter((t) => t.status === 'failed').length
		const total = file.tests.length
		const assertionCount = file.tests.reduce((sum, t) => sum + t.assertions.length, 0)

		const statusIcon = file.status === 'passed' ? color.green('✓') : color.red('✗')
		const shortPath = file.path.split('/').slice(-2).join('/')

		// Format: ✓ sess_abc123  │ commands/ping.test.ts  │ 3/3 passed, 5 assertions
		const passText = failed > 0
			? `${color.green(`${passed}`)}/${total} passed`
			: color.green(`${passed}/${total} passed`)

		logger.log(
			`  ${statusIcon} ${file.sessionId.slice(0, 12)}  │ ${shortPath.padEnd(28)} │ ${passText}, ${assertionCount} assertions`
		)
	}

	logger.log(color.dim('  ──────────────────────────────────────────────────────────────'))
}
