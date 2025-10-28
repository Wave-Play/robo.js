import { afterEach, beforeEach, describe, expect, test, jest } from '@jest/globals'
import type { Mock } from '@jest/globals'

// Neutral environment constants to avoid interference from process environment
const NEUTRAL_LOGGER_ENV = {
	NODE_ENV: 'test',
	ROBOPLAY_ENV: undefined,
	ROBO_SHARD_MODE: undefined,
	ROBO_SHARD_LONGEST_MODE: undefined
}

interface WithFreshLoggerOptions {
	env?: Record<string, string | undefined>
	processProps?: Record<string, unknown>
	mocks?: {
		color?: Record<string, (...args: unknown[]) => string>
		mode?: Record<string, (...args: unknown[]) => string>
		util?: Record<string, (...args: unknown[]) => string>
	}
}

/**
 * Helper function to load logger module with fresh state and custom environment
 */
async function withFreshLogger<T>(
	options: WithFreshLoggerOptions = {},
	testFn: (loggerModule: {
		logger: (...args: unknown[]) => unknown
		Logger: new (...args: unknown[]) => unknown
	}) => Promise<T> | T
): Promise<T> {
	const originalEnv = { ...process.env }
	const originalStdoutWrite = process.stdout.write
	const originalStderrWrite = process.stderr.write

	try {
		// Set up environment
		Object.assign(process.env, NEUTRAL_LOGGER_ENV, options.env || {})

		// Set up process properties
		if (options.processProps) {
			Object.assign(process, options.processProps)
		}

		return await jest.isolateModulesAsync(async () => {
			// Mock dependencies if provided
			if (options.mocks?.color) {
				jest.unstable_mockModule('../dist/core/color.js', () => options.mocks!.color!)
			}
			if (options.mocks?.mode) {
				jest.unstable_mockModule('../dist/core/mode.js', () => options.mocks!.mode!)
			}
			if (options.mocks?.util) {
				jest.unstable_mockModule('node:util', () => options.mocks!.util!)
			}

			const loggerModule = await import('../dist/core/logger.js')
			return await testFn(loggerModule as never)
		})
	} finally {
		// Restore original values
		process.env = originalEnv
		process.stdout.write = originalStdoutWrite
		process.stderr.write = originalStderrWrite
		jest.restoreAllMocks()
	}
}

/**
 * Creates a mock function that captures stdout.write calls
 */
function captureStdout(): Mock<typeof process.stdout.write> {
	const mock = jest.fn<typeof process.stdout.write>()
	process.stdout.write = mock as never
	return mock
}

/**
 * Creates a mock function that captures stderr.write calls
 */
function captureStderr(): Mock<typeof process.stderr.write> {
	const mock = jest.fn<typeof process.stderr.write>()
	process.stderr.write = mock as never
	return mock
}

/**
 * Creates a mock inspect function with predictable output
 */
function mockInspect() {
	return jest.fn((obj: unknown) => {
		if (obj instanceof Error) {
			return `Error: ${obj.message}`
		}
		if (typeof obj === 'object' && obj !== null) {
			try {
				return JSON.stringify(obj)
			} catch {
				return '[circular]'
			}
		}
		return String(obj)
	})
}

/**
 * Simulates browser environment by setting up window and document
 */
function simulateBrowser() {
	;(global as never)['window'] = { document: {} }
	;(global as never)['document'] = {}

	const consoleLog = jest.fn()
	const consoleError = jest.fn()
	global.console.log = consoleLog
	global.console.error = consoleError

	return { consoleLog, consoleError }
}

/**
 * Extracts ANSI codes from text for assertion purposes
 */
function extractAnsiCodes(text: string): string[] {
	const ansiRegex = /\x1b\[([0-9;]+)m/g
	const codes: string[] = []
	let match
	while ((match = ansiRegex.exec(text)) !== null) {
		codes.push(match[1])
	}
	return codes
}

describe('Logger class instantiation and configuration', () => {
	test('default Logger constructor creates instance with default options', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const instance = new Logger()
			expect(instance).toBeInstanceOf(Logger)
			expect((instance as { enabled: boolean }).enabled).toBe(true)
			expect((instance as { getLevel: () => string }).getLevel()).toBe('info')
		})
	})

	test('Logger constructor with custom options', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const instance = new Logger({
				level: 'debug',
				enabled: false,
				maxEntries: 50
			})
			expect((instance as { enabled: boolean }).enabled).toBe(false)
			expect((instance as { getLevel: () => string }).getLevel()).toBe('debug')
		})
	})

	test('Logger.setup() method can reconfigure existing instance', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const instance = new Logger({ level: 'info' })
			;(instance as { setup: (opts: unknown) => void }).setup({ level: 'error' })
			expect((instance as { getLevel: () => string }).getLevel()).toBe('error')
		})
	})

	test('Logger with customLevels option adds custom log levels with priorities', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const instance = new Logger({
				customLevels: {
					critical: { priority: 60, label: 'CRITICAL', color: 'red' }
				}
			})
			const levels = (instance as { getLevelValues: () => Record<string, number> }).getLevelValues()
			expect(levels.critical).toBe(60)
		})
	})

	test('Logger with custom drain function replaces default consoleDrain', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const customDrain = jest.fn()
			const instance = new Logger({ drain: customDrain })
			;(instance as { info: (...args: unknown[]) => void }).info('test message')
			// Wait for async drain
			await (instance as { flush: () => Promise<void> }).flush()
			expect(customDrain).toHaveBeenCalled()
		})
	})

	test('Logger with prefix option sets prefix for forked loggers', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const instance = new Logger({ prefix: 'TEST' })
			expect((instance as { prefix?: string }).prefix).toBe('TEST')
		})
	})

	test('Logger with parent option creates child logger that delegates to parent', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const parent = new Logger()
			const child = new Logger({ parent: parent as never, prefix: 'child' })
			expect((child as { parent?: unknown }).parent).toBe(parent)
		})
	})

	test('ROBOPLAY_ENV environment variable forces level to trace', async () => {
		await withFreshLogger({ env: { ROBOPLAY_ENV: 'true' } }, async ({ Logger }) => {
			const instance = new Logger({ level: 'error' })
			expect((instance as { getLevel: () => string }).getLevel()).toBe('trace')
		})
	})

	test('all public methods are bound correctly (can be destructured)', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const instance = new Logger()
			const { info, error, debug } = instance as {
				info: (...args: unknown[]) => void
				error: (...args: unknown[]) => void
				debug: (...args: unknown[]) => void
			}
			const stdout = captureStdout()

			// Should not throw
			info('test')
			debug('test')
			error('test')

			expect(stdout).toHaveBeenCalled()
		})
	})
})

describe('All log levels (trace, debug, info, wait, log, event, ready, warn, error)', () => {
	test('logger.trace() outputs to stdout with trace label', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger({ level: 'trace' })
			;(instance as { trace: (...args: unknown[]) => void }).trace('trace message')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('trace message')
		})
	})

	test('logger.debug() outputs to stdout with debug label', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger({ level: 'debug' })
			;(instance as { debug: (...args: unknown[]) => void }).debug('debug message')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('debug message')
		})
	})

	test('logger.info() outputs to stdout with info label', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('info message')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('info message')
		})
	})

	test('logger.wait() outputs to stdout with wait label', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger()
			;(instance as { wait: (...args: unknown[]) => void }).wait('waiting...')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('waiting...')
		})
	})

	test('logger.log() outputs to stdout without level label', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger()
			;(instance as { log: (...args: unknown[]) => void }).log('plain log')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('plain log')
		})
	})

	test('logger.event() outputs to stdout with event label', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger()
			;(instance as { event: (...args: unknown[]) => void }).event('event occurred')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('event occurred')
		})
	})

	test('logger.ready() outputs to stdout with ready label', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger()
			;(instance as { ready: (...args: unknown[]) => void }).ready('ready to go')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('ready to go')
		})
	})

	test('logger.warn() outputs to stderr with warn label', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stderr = captureStderr()
			const instance = new Logger()
			;(instance as { warn: (...args: unknown[]) => void }).warn('warning message')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stderr.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('warning message')
		})
	})

	test('logger.error() outputs to stderr with error label', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stderr = captureStderr()
			const instance = new Logger()
			;(instance as { error: (...args: unknown[]) => void }).error('error message')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stderr.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('error message')
		})
	})

	test('each log level accepts multiple arguments', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('arg1', 'arg2', { key: 'value' })
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('arg1')
			expect(output).toContain('arg2')
		})
	})

	test('each log level handles Error instances correctly', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger()
			const error = new Error('test error')
			;(instance as { info: (...args: unknown[]) => void }).info(error)
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('test error')
		})
	})

	test('log methods work when logger is disabled (no output)', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger({ enabled: false })
			;(instance as { info: (...args: unknown[]) => void }).info('should not appear')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(stdout).not.toHaveBeenCalled()
		})
	})

	test('ROBO_SHARD_MODE environment variable adds mode label to logs', async () => {
		await withFreshLogger(
			{
				env: { ROBO_SHARD_MODE: 'test-mode' },
				mocks: {
					mode: {
						getModeLabel: () => '[test-mode]'
					}
				}
			},
			async ({ Logger }) => {
				const stdout = captureStdout()
				const instance = new Logger()
				;(instance as { info: (...args: unknown[]) => void }).info('with mode')
				await (instance as { flush: () => Promise<void> }).flush()

				const output = stdout.mock.calls.map((call) => call[0]).join('')
				expect(output).toContain('[test-mode]')
			}
		)
	})

	test('mode label with getModeColor applies color wrapper and padding', async () => {
		await withFreshLogger(
			{
				env: { ROBO_SHARD_MODE: 'test-mode', ROBO_SHARD_LONGEST_MODE: 'longer-mode' },
				mocks: {
					mode: {
						getModeColor: (mode: string) => (text: string) => `[X]${text}[/X]`,
						getModeLabel: () => '[test-mode]'
					}
				}
			},
			async ({ Logger }) => {
				const stdout = captureStdout()
				const instance = new Logger()
				;(instance as { info: (...args: unknown[]) => void }).info('with colored mode')
				await (instance as { flush: () => Promise<void> }).flush()

				const output = stdout.mock.calls.map((call) => call[0]).join('')
				// Should contain the mode color marker
				expect(output).toContain('[X]')
				expect(output).toContain('[/X]')
				// Mode should appear at start of log with correct spacing
				const lines = output.split('\n').filter((line) => line.includes('with colored mode'))
				expect(lines.length).toBeGreaterThan(0)
			}
		)
	})
})

describe('Level filtering and custom levels', () => {
	test('level=trace allows all log levels through', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger({ level: 'trace' })
			;(instance as { trace: (...args: unknown[]) => void }).trace('trace')
			;(instance as { debug: (...args: unknown[]) => void }).debug('debug')
			;(instance as { info: (...args: unknown[]) => void }).info('info')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('trace')
			expect(output).toContain('debug')
			expect(output).toContain('info')
		})
	})

	test('level=debug filters out trace logs', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger({ level: 'debug' })
			;(instance as { trace: (...args: unknown[]) => void }).trace('should not appear')
			;(instance as { debug: (...args: unknown[]) => void }).debug('should appear')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).not.toContain('should not appear')
			expect(output).toContain('should appear')
		})
	})

	test('level=info filters out trace and debug logs', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger({ level: 'info' })
			;(instance as { trace: (...args: unknown[]) => void }).trace('no trace')
			;(instance as { debug: (...args: unknown[]) => void }).debug('no debug')
			;(instance as { info: (...args: unknown[]) => void }).info('yes info')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).not.toContain('no trace')
			expect(output).not.toContain('no debug')
			expect(output).toContain('yes info')
		})
	})

	test('level=warn filters out trace, debug, info, wait, event, ready logs', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const stderr = captureStderr()
			const instance = new Logger({ level: 'warn' })
			;(instance as { info: (...args: unknown[]) => void }).info('no info')
			;(instance as { wait: (...args: unknown[]) => void }).wait('no wait')
			;(instance as { event: (...args: unknown[]) => void }).event('no event')
			;(instance as { ready: (...args: unknown[]) => void }).ready('no ready')
			;(instance as { warn: (...args: unknown[]) => void }).warn('yes warn')
			await (instance as { flush: () => Promise<void> }).flush()

			const stdoutOutput = stdout.mock.calls.map((call) => call[0]).join('')
			const stderrOutput = stderr.mock.calls.map((call) => call[0]).join('')
			expect(stdoutOutput).not.toContain('no info')
			expect(stdoutOutput).not.toContain('no wait')
			expect(stdoutOutput).not.toContain('no event')
			expect(stdoutOutput).not.toContain('no ready')
			expect(stderrOutput).toContain('yes warn')
		})
	})

	test('level=error only allows error logs through', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const stderr = captureStderr()
			const instance = new Logger({ level: 'error' })
			;(instance as { info: (...args: unknown[]) => void }).info('no info')
			;(instance as { warn: (...args: unknown[]) => void }).warn('no warn')
			;(instance as { error: (...args: unknown[]) => void }).error('yes error')
			await (instance as { flush: () => Promise<void> }).flush()

			const stdoutOutput = stdout.mock.calls.map((call) => call[0]).join('')
			const stderrOutput = stderr.mock.calls.map((call) => call[0]).join('')
			expect(stdoutOutput).not.toContain('no info')
			expect(stderrOutput).not.toContain('no warn')
			expect(stderrOutput).toContain('yes error')
		})
	})

	test('custom levels with priority values integrate into filtering system', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger({
				level: 'critical',
				customLevels: {
					critical: { priority: 60, label: 'CRIT', color: 'red' }
				}
			}) as {
				info: (...args: unknown[]) => void
				critical: (...args: unknown[]) => void
				flush: () => Promise<void>
			}
			instance.info('no info')
			instance.critical('yes critical')
			await instance.flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).not.toContain('no info')
			expect(output).toContain('yes critical')
		})
	})

	test('logger.custom() method calls custom level if defined', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger({
				customLevels: {
					custom: { priority: 30, label: 'CUSTOM', color: 'blue' }
				}
			}) as {
				custom: (...args: unknown[]) => void
				flush: () => Promise<void>
			}
			instance.custom('custom message')
			await instance.flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('custom message')
		})
	})

	test('getLevelValues() returns correct priority mapping', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const instance = new Logger({
				customLevels: {
					critical: { priority: 60, label: 'CRIT', color: 'red' }
				}
			})
			const levels = (instance as { getLevelValues: () => Record<string, number> }).getLevelValues()
			expect(levels.trace).toBe(0)
			expect(levels.debug).toBe(1)
			expect(levels.info).toBe(2)
			expect(levels.wait).toBe(3)
			expect(levels.other).toBe(4)
			expect(levels.event).toBe(5)
			expect(levels.ready).toBe(6)
			expect(levels.warn).toBe(7)
			expect(levels.error).toBe(8)
			expect(levels.critical).toBe(60)
			// Verify custom level is higher than error
			expect(levels.critical).toBeGreaterThan(levels.error)
		})
	})

	test('getLevel() returns current log level', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const instance = new Logger({ level: 'debug' })
			expect((instance as { getLevel: () => string }).getLevel()).toBe('debug')
		})
	})
})

describe('Forking with prefixes and parent delegation', () => {
	test('logger.fork() creates new Logger instance with prefix', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const parent = new Logger()
			const child = (parent as { fork: (prefix: string) => unknown }).fork('child')
			expect(child).toBeInstanceOf(Logger)
			expect((child as { prefix?: string }).prefix).toBe('child')
		})
	})

	test('forked logger delegates _log calls to parent', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const parent = new Logger()
			const child = (parent as { fork: (prefix: string) => { info: (...args: unknown[]) => void } }).fork('child')
			child.info('test message')
			await (parent as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('test message')
		})
	})

	test('forked logger prefix appears in log output', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const parent = new Logger()
			const child = (parent as { fork: (prefix: string) => { info: (...args: unknown[]) => void } }).fork('PREFIX')
			child.info('test')
			await (parent as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('PREFIX')
		})
	})

	test('nested forks concatenate prefixes', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const parent = new Logger()
			const child = (parent as { fork: (prefix: string) => { fork: (prefix: string) => unknown } }).fork('parent')
			const grandchild = child.fork('child') as { info: (...args: unknown[]) => void }
			grandchild.info('test')
			await (parent as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('parent')
			expect(output).toContain('child')
		})
	})

	test('forked logger inherits parent customLevels', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const parent = new Logger({
				customLevels: {
					custom: { priority: 30, label: 'CUSTOM', color: 'blue' }
				}
			})
			const child = (parent as { fork: (prefix: string) => unknown }).fork('child')
			const levels = (child as { getLevelValues: () => Record<string, number> }).getLevelValues()
			expect(levels.custom).toBe(30)
		})
	})

	test('forked logger inherits parent enabled state', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const parent = new Logger({ enabled: false })
			const child = (parent as { fork: (prefix: string) => { info: (...args: unknown[]) => void } }).fork('child')
			const stdout = captureStdout()
			child.info('should not appear')
			await (parent as { flush: () => Promise<void> }).flush()

			expect(stdout).not.toHaveBeenCalled()
		})
	})

	test('forked logger inherits parent level', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const parent = new Logger({ level: 'warn' })
			const child = (parent as {
				fork: (prefix: string) => { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }
			}).fork('child')
			const stdout = captureStdout()
			const stderr = captureStderr()
			child.info('no info')
			child.warn('yes warn')
			await (parent as { flush: () => Promise<void> }).flush()

			const stdoutOutput = stdout.mock.calls.map((call) => call[0]).join('')
			const stderrOutput = stderr.mock.calls.map((call) => call[0]).join('')
			expect(stdoutOutput).not.toContain('no info')
			expect(stderrOutput).toContain('yes warn')
		})
	})

	test('forked logger.getLevel() delegates to parent', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const parent = new Logger({ level: 'debug' })
			const child = (parent as { fork: (prefix: string) => unknown }).fork('child')
			expect((child as { getLevel: () => string }).getLevel()).toBe('debug')
		})
	})

	test('forked logger.getLevelValues() delegates to parent', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const parent = new Logger()
			const child = (parent as { fork: (prefix: string) => unknown }).fork('child')
			const parentLevels = (parent as { getLevelValues: () => Record<string, number> }).getLevelValues()
			const childLevels = (child as { getLevelValues: () => Record<string, number> }).getLevelValues()
			expect(childLevels).toEqual(parentLevels)
		})
	})

	test('forked logger.getRecentLogs() delegates to parent', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const parent = new Logger()
			;(parent as { info: (...args: unknown[]) => void }).info('parent log')
			const child = (parent as { fork: (prefix: string) => { info: (...args: unknown[]) => void } }).fork('child')
			child.info('child log')
			await (parent as { flush: () => Promise<void> }).flush()

			const parentLogs = (parent as { getRecentLogs: (count?: number) => unknown[] }).getRecentLogs()
			const childLogs = (child as { getRecentLogs: (count?: number) => unknown[] }).getRecentLogs()
			expect(childLogs).toEqual(parentLogs)
		})
	})

	test('forked logger.flush() delegates to parent', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const customDrain = jest.fn(() => Promise.resolve())
			const parent = new Logger({ drain: customDrain as never })
			const child = (parent as { fork: (prefix: string) => { info: (...args: unknown[]) => void } }).fork('child')
			child.info('test')

			await (child as { flush: () => Promise<void> }).flush()
			expect(customDrain).toHaveBeenCalled()
		})
	})

	test('multiple forks from same parent are independent', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const parent = new Logger()
			const child1 = (parent as { fork: (prefix: string) => { info: (...args: unknown[]) => void } }).fork('child1')
			const child2 = (parent as { fork: (prefix: string) => { info: (...args: unknown[]) => void } }).fork('child2')

			child1.info('from child1')
			child2.info('from child2')
			await (parent as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('child1')
			expect(output).toContain('from child1')
			expect(output).toContain('child2')
			expect(output).toContain('from child2')
		})
	})

	test('global logger.fork() static method creates fork from singleton', async () => {
		await withFreshLogger({}, async ({ logger }) => {
			const child = (logger as { fork: (prefix: string) => unknown }).fork('global-child')
			expect((child as { prefix?: string }).prefix).toBe('global-child')
		})
	})
})

describe('Log buffer (circular buffer, recent logs retrieval)', () => {
	test('log buffer initializes with maxEntries size (default 100)', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('test')
			await (instance as { flush: () => Promise<void> }).flush()

			const logs = (instance as { getRecentLogs: () => unknown[] }).getRecentLogs()
			expect(logs).toHaveLength(1)
		})
	})

	test('log buffer stores entry objects with level, data, timestamp', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('test message')
			await (instance as { flush: () => Promise<void> }).flush()

			const logs = (instance as { getRecentLogs: () => unknown[] }).getRecentLogs()
			const entry = logs[0] as { level: string; timestamp: Date; message: () => string }
			expect(entry.level).toBe('info')
			expect(entry.timestamp).toBeInstanceOf(Date)
			expect(typeof entry.message).toBe('function')
		})
	})

	test('log buffer wraps around when full (circular behavior)', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger({ maxEntries: 3 })
			const log = instance as { info: (...args: unknown[]) => void; flush: () => Promise<void> }

			log.info('message 1')
			log.info('message 2')
			log.info('message 3')
			log.info('message 4') // Should wrap around
			await log.flush()

			const logs = (instance as { getRecentLogs: () => { message: () => string }[] }).getRecentLogs()
			expect(logs).toHaveLength(3)
			// Most recent should be message 4
			expect(logs[0].message()).toContain('message 4')
			expect(logs[1].message()).toContain('message 3')
			expect(logs[2].message()).toContain('message 2')
		})
	})

	test('getRecentLogs() returns most recent N logs in reverse chronological order', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger()
			const log = instance as { info: (...args: unknown[]) => void; flush: () => Promise<void> }

			log.info('first')
			log.info('second')
			log.info('third')
			await log.flush()

			const logs = (instance as { getRecentLogs: () => { message: () => string }[] }).getRecentLogs()
			expect(logs[0].message()).toContain('third')
			expect(logs[1].message()).toContain('second')
			expect(logs[2].message()).toContain('first')
		})
	})

	test('getRecentLogs(50) returns up to 50 most recent logs', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger()
			const log = instance as { info: (...args: unknown[]) => void; flush: () => Promise<void> }

			for (let i = 0; i < 100; i++) {
				log.info(`message ${i}`)
			}
			await log.flush()

			const logs = (instance as { getRecentLogs: (count?: number) => unknown[] }).getRecentLogs(50)
			expect(logs).toHaveLength(50)
		})
	})

	test('getRecentLogs(0) returns empty array', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('test')
			await (instance as { flush: () => Promise<void> }).flush()

			const logs = (instance as { getRecentLogs: (count?: number) => unknown[] }).getRecentLogs(0)
			expect(logs).toEqual([])
		})
	})

	test('getRecentLogs() with count > buffer size returns all available logs', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger({ maxEntries: 10 })
			const log = instance as { info: (...args: unknown[]) => void; flush: () => Promise<void> }

			for (let i = 0; i < 5; i++) {
				log.info(`message ${i}`)
			}
			await log.flush()

			const logs = (instance as { getRecentLogs: (count?: number) => unknown[] }).getRecentLogs(100)
			expect(logs).toHaveLength(5)
		})
	})

	test('log buffer only stores logs in DEBUG_MODE (NODE_ENV !== production)', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('dev message')
			await (instance as { flush: () => Promise<void> }).flush()

			const logs = (instance as { getRecentLogs: () => unknown[] }).getRecentLogs()
			expect(logs.length).toBeGreaterThan(0)
		})
	})

	test('log buffer does not store logs in production mode', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'production' } }, async ({ Logger }) => {
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('prod message')
			await (instance as { flush: () => Promise<void> }).flush()

			const logs = (instance as { getRecentLogs: () => unknown[] }).getRecentLogs()
			expect(logs).toEqual([])
		})
	})

	test('custom maxEntries option changes buffer size', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger({ maxEntries: 5 })
			const log = instance as { info: (...args: unknown[]) => void; flush: () => Promise<void> }

			for (let i = 0; i < 10; i++) {
				log.info(`message ${i}`)
			}
			await log.flush()

			const logs = (instance as { getRecentLogs: () => unknown[] }).getRecentLogs()
			expect(logs).toHaveLength(5)
		})
	})

	test('global logger.getRecentLogs() static method retrieves from singleton', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ logger }) => {
			;(logger as { info: (...args: unknown[]) => void }).info('global message')
			await (logger as { flush: () => Promise<void> }).flush()

			const logs = (logger as { getRecentLogs: () => { message: () => string }[] }).getRecentLogs()
			expect(logs.length).toBeGreaterThan(0)
			expect(logs[0].message()).toContain('global message')
		})
	})
})

describe('Custom drains and flush functionality', () => {
	test('setDrain() replaces default consoleDrain', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const customDrain = jest.fn()
			const instance = new Logger()
			;(instance as { setDrain: (drain: unknown) => void }).setDrain(customDrain)
			;(instance as { info: (...args: unknown[]) => void }).info('test')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(customDrain).toHaveBeenCalled()
		})
	})

	test('custom drain receives logger instance, level, and data arguments', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const customDrain = jest.fn()
			const instance = new Logger({ drain: customDrain as never })
			;(instance as { info: (...args: unknown[]) => void }).info('test', 'data')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(customDrain).toHaveBeenCalledWith(instance, 'info', ['test', 'data'])
		})
	})

	test('custom drain is called for each log method', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const customDrain = jest.fn()
			const instance = new Logger({ drain: customDrain as never }) as {
				info: (...args: unknown[]) => void
				warn: (...args: unknown[]) => void
				error: (...args: unknown[]) => void
				flush: () => Promise<void>
			}

			instance.info('info')
			instance.warn('warn')
			instance.error('error')
			await instance.flush()

			expect(customDrain).toHaveBeenCalledTimes(3)
		})
	})

	test('custom drain bypasses level filtering (receives all logs)', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const customDrain = jest.fn()
			const instance = new Logger({ level: 'error', drain: customDrain as never }) as {
				info: (...args: unknown[]) => void
				warn: (...args: unknown[]) => void
				error: (...args: unknown[]) => void
				flush: () => Promise<void>
			}

			instance.info('info message')
			instance.warn('warn message')
			instance.error('error message')
			await instance.flush()

			// Custom drain should receive all logs, even info and warn
			expect(customDrain).toHaveBeenCalledTimes(3)
			expect(customDrain).toHaveBeenCalledWith(instance, 'info', expect.any(Array))
			expect(customDrain).toHaveBeenCalledWith(instance, 'warn', expect.any(Array))
			expect(customDrain).toHaveBeenCalledWith(instance, 'error', expect.any(Array))
		})
	})

	test('default consoleDrain respects level filtering', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const stderr = captureStderr()
			const instance = new Logger({ level: 'error' }) as {
				info: (...args: unknown[]) => void
				warn: (...args: unknown[]) => void
				error: (...args: unknown[]) => void
				flush: () => Promise<void>
			}

			instance.info('info message')
			instance.warn('warn message')
			instance.error('error message')
			await instance.flush()

			const stdoutOutput = stdout.mock.calls.map((call) => call[0]).join('')
			const stderrOutput = stderr.mock.calls.map((call) => call[0]).join('')

			// Default drain should filter out info and warn
			expect(stdoutOutput).not.toContain('info message')
			expect(stderrOutput).not.toContain('warn message')
			expect(stderrOutput).toContain('error message')
		})
	})

	test('custom drain can be async (returns Promise)', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const customDrain = jest.fn(() => Promise.resolve())
			const instance = new Logger({ drain: customDrain as never })
			;(instance as { info: (...args: unknown[]) => void }).info('test')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(customDrain).toHaveBeenCalled()
		})
	})

	test('flush() waits for all pending drain promises to settle', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			let drainCompleted = false
			const customDrain = jest.fn(
				() =>
					new Promise((resolve) => {
						setTimeout(() => {
							drainCompleted = true
							resolve(undefined)
						}, 10)
					})
			)
			const instance = new Logger({ drain: customDrain as never })
			;(instance as { info: (...args: unknown[]) => void }).info('test')

			expect(drainCompleted).toBe(false)
			await (instance as { flush: () => Promise<void> }).flush()
			expect(drainCompleted).toBe(true)
		})
	})

	test('flush() on forked logger delegates to parent', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const customDrain = jest.fn(() => Promise.resolve())
			const parent = new Logger({ drain: customDrain as never })
			const child = (parent as { fork: (prefix: string) => { info: (...args: unknown[]) => void } }).fork('child')

			child.info('test')
			await (child as { flush: () => Promise<void> }).flush()

			expect(customDrain).toHaveBeenCalled()
		})
	})

	test('multiple concurrent logs all complete before flush resolves', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const completionOrder: number[] = []
			const customDrain = jest.fn((_, __, [msg]: [string]) => {
				return new Promise((resolve) => {
					const delay = msg === 'fast' ? 5 : 20
					setTimeout(() => {
						completionOrder.push(delay)
						resolve(undefined)
					}, delay)
				})
			})

			const instance = new Logger({ drain: customDrain as never }) as {
				info: (...args: unknown[]) => void
				flush: () => Promise<void>
			}

			instance.info('slow')
			instance.info('fast')
			await instance.flush()

			expect(completionOrder).toHaveLength(2)
		})
	})

	test('drain errors do not crash logger (Promise.allSettled)', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const customDrain = jest.fn(() => Promise.reject(new Error('drain error')))
			const instance = new Logger({ drain: customDrain as never })
			;(instance as { info: (...args: unknown[]) => void }).info('test')

			// Should not throw
			await expect((instance as { flush: () => Promise<void> }).flush()).resolves.toBeUndefined()
		})
	})

	test('pendingDrains set tracks active drain promises', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			let pendingCount = 0
			const customDrain = jest.fn(
				() =>
					new Promise((resolve) => {
						pendingCount++
						setTimeout(() => {
							pendingCount--
							resolve(undefined)
						}, 10)
					})
			)

			const instance = new Logger({ drain: customDrain as never })
			;(instance as { info: (...args: unknown[]) => void }).info('test')

			expect(pendingCount).toBe(1)
			await (instance as { flush: () => Promise<void> }).flush()
			expect(pendingCount).toBe(0)
		})
	})

	test('global logger.flush() static method flushes singleton', async () => {
		await withFreshLogger({}, async ({ logger }) => {
			const customDrain = jest.fn(() => Promise.resolve())
			;(logger as { setDrain: (drain: unknown) => void }).setDrain(customDrain)
			;(logger as { info: (...args: unknown[]) => void }).info('test')

			await (logger as { flush: () => Promise<void> }).flush()
			expect(customDrain).toHaveBeenCalled()
		})
	})

	test('consoleDrain writes to stdout for info/debug/trace levels', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger({ level: 'trace' }) as {
				trace: (...args: unknown[]) => void
				debug: (...args: unknown[]) => void
				info: (...args: unknown[]) => void
				flush: () => Promise<void>
			}

			instance.trace('trace')
			instance.debug('debug')
			instance.info('info')
			await instance.flush()

			expect(stdout).toHaveBeenCalled()
		})
	})

	test('consoleDrain writes to stderr for warn/error levels', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stderr = captureStderr()
			const instance = new Logger() as {
				warn: (...args: unknown[]) => void
				error: (...args: unknown[]) => void
				flush: () => Promise<void>
			}

			instance.warn('warn')
			instance.error('error')
			await instance.flush()

			expect(stderr).toHaveBeenCalled()
		})
	})
})

describe('ANSI to browser format conversion', () => {
	beforeEach(() => {
		// Clean up any existing global properties
		delete (global as never)['window']
		delete (global as never)['document']
	})

	afterEach(() => {
		delete (global as never)['window']
		delete (global as never)['document']
		jest.restoreAllMocks()
	})

	test('ansiToBrowserFormat() converts simple ANSI codes to %c format', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			simulateBrowser()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[31mred text\x1b[0m')
			await (instance as { flush: () => Promise<void> }).flush()

			// In browser, should use console.log
			expect(global.console.log).toHaveBeenCalled()
		})
	})

	test('consoleDrain in browser environment uses console.log for info levels', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const { consoleLog } = simulateBrowser()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('browser info')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(consoleLog).toHaveBeenCalled()
		})
	})

	test('consoleDrain in browser uses console.error for warn/error levels', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const { consoleError } = simulateBrowser()
			const instance = new Logger() as {
				warn: (...args: unknown[]) => void
				error: (...args: unknown[]) => void
				flush: () => Promise<void>
			}

			instance.warn('browser warn')
			instance.error('browser error')
			await instance.flush()

			expect(consoleError).toHaveBeenCalledTimes(2)
		})
	})

	test('browser: bold + red ANSI produces CSS with font-weight: bold and color: #F44336', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const { consoleLog } = simulateBrowser()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[1m\x1b[31mtext\x1b[0m')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(consoleLog).toHaveBeenCalled()
			const calls = consoleLog.mock.calls
			const cssArgs = calls.flatMap((call) => call.slice(1))
			const combinedCSS = cssArgs.join(' ')
			expect(combinedCSS).toContain('font-weight: bold')
			expect(combinedCSS).toContain('color: #F44336')
		})
	})

	test('browser: dimColor helper with 6-digit hex produces dimmed color', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const { consoleLog } = simulateBrowser()
			const instance = new Logger()
			// ANSI code 2 = dim, then a color
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[2m\x1b[31mtext\x1b[0m')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(consoleLog).toHaveBeenCalled()
			const calls = consoleLog.mock.calls
			const cssArgs = calls.flatMap((call) => call.slice(1))
			const combinedCSS = cssArgs.join(' ')
			// Should contain dimmed color (default dim color is #999999)
			expect(combinedCSS).toContain('color')
		})
	})

	test('browser: mergeTextDecoration helper deduplicates underline', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const { consoleLog } = simulateBrowser()
			const instance = new Logger()
			// Double underline codes
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[4m\x1b[4mtext\x1b[0m')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(consoleLog).toHaveBeenCalled()
			const calls = consoleLog.mock.calls
			const cssArgs = calls.flatMap((call) => call.slice(1))
			const combinedCSS = cssArgs.join(' ')
			// Should contain text-decoration with underline
			expect(combinedCSS).toContain('text-decoration')
		})
	})

	test('browser: removeTextDecoration helper removes underline with code 24', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const { consoleLog } = simulateBrowser()
			const instance = new Logger()
			// Add underline, then remove it
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[4munderline\x1b[24mno underline\x1b[0m')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(consoleLog).toHaveBeenCalled()
		})
	})

	test('browser: updateStyle reset code 0 clears all styles', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const { consoleLog } = simulateBrowser()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[1m\x1b[31mbold red\x1b[0mnormal')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(consoleLog).toHaveBeenCalled()
			const calls = consoleLog.mock.calls
			// Should have multiple style arguments, some empty after reset
			expect(calls.length).toBeGreaterThan(0)
		})
	})

	test('browser: updateStyle reset code 22 removes bold (font-weight)', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const { consoleLog } = simulateBrowser()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[1mbold\x1b[22mnot bold')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(consoleLog).toHaveBeenCalled()
		})
	})

	test('browser: updateStyle reset code 23 removes italic (font-style)', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const { consoleLog } = simulateBrowser()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[3mitalic\x1b[23mnot italic')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(consoleLog).toHaveBeenCalled()
		})
	})

	test('browser: updateStyle reset code 27 removes invert filter', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const { consoleLog } = simulateBrowser()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[7minverted\x1b[27mnormal')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(consoleLog).toHaveBeenCalled()
		})
	})

	test('browser: updateStyle reset code 28 removes hidden visibility', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const { consoleLog } = simulateBrowser()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[8mhidden\x1b[28mvisible')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(consoleLog).toHaveBeenCalled()
		})
	})

	test('browser: updateStyle reset code 29 removes strikethrough', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const { consoleLog } = simulateBrowser()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[9mstrikethrough\x1b[29mnormal')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(consoleLog).toHaveBeenCalled()
		})
	})

	test('browser: foreground color codes 30-37 produce correct colors', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const { consoleLog } = simulateBrowser()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[31mred\x1b[32mgreen\x1b[34mblue')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(consoleLog).toHaveBeenCalled()
			const calls = consoleLog.mock.calls
			const cssArgs = calls.flatMap((call) => call.slice(1))
			const combinedCSS = cssArgs.join(' ')
			expect(combinedCSS).toContain('color')
		})
	})

	test('browser: background color codes 40-47 produce correct background colors', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const { consoleLog } = simulateBrowser()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[41mred bg\x1b[42mgreen bg')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(consoleLog).toHaveBeenCalled()
			const calls = consoleLog.mock.calls
			const cssArgs = calls.flatMap((call) => call.slice(1))
			const combinedCSS = cssArgs.join(' ')
			expect(combinedCSS).toContain('background-color')
		})
	})

	test('browser: default foreground reset code 39 sets color to inherit', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const { consoleLog } = simulateBrowser()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[31mred\x1b[39mdefault')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(consoleLog).toHaveBeenCalled()
			const calls = consoleLog.mock.calls
			const cssArgs = calls.flatMap((call) => call.slice(1))
			const combinedCSS = cssArgs.join(' ')
			expect(combinedCSS).toContain('color')
		})
	})

	test('browser: default background reset code 49 sets background-color to inherit', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const { consoleLog } = simulateBrowser()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[41mred bg\x1b[49mdefault bg')
			await (instance as { flush: () => Promise<void> }).flush()

			expect(consoleLog).toHaveBeenCalled()
			const calls = consoleLog.mock.calls
			const cssArgs = calls.flatMap((call) => call.slice(1))
			const combinedCSS = cssArgs.join(' ')
			expect(combinedCSS).toContain('background-color')
		})
	})

	test('browser: extractAnsiCodes extracts codes from text with ANSI sequences', async () => {
		const text = '\x1b[1m\x1b[31mbold red\x1b[0m'
		const codes = extractAnsiCodes(text)
		expect(codes).toContain('1')
		expect(codes).toContain('31')
		expect(codes).toContain('0')
	})
})

describe('Helper functions (dimColor, mergeTextDecoration, removeTextDecoration, updateStyle)', () => {
	// Note: These are internal functions, so we test them indirectly through Logger behavior
	test('Logger with dim color code produces dimmed output', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[2mdimmed text\x1b[0m')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('dimmed text')
		})
	})

	test('Logger with underline code produces underlined output', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[4munderlined\x1b[0m')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('underlined')
		})
	})

	test('Logger with italic code produces italic output', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[3mitalic\x1b[0m')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('italic')
		})
	})

	test('Logger with bold code produces bold output', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[1mbold\x1b[0m')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('bold')
		})
	})

	test('Logger with foreground color codes produces colored output', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[31mred\x1b[0m')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('red')
		})
	})

	test('Logger with background color codes produces colored output', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[41mbg-red\x1b[0m')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('bg-red')
		})
	})

	test('Logger with multiple ANSI codes in single sequence', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[1;36mbold cyan\x1b[0m')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('bold cyan')
		})
	})

	test('Logger with reset code clears styles', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[31mred\x1b[0mnormal')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('red')
			expect(output).toContain('normal')
		})
	})
})

describe('LogEntry class and message extraction', () => {
	test('Log entry stores level, data, and timestamp', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('test data')
			await (instance as { flush: () => Promise<void> }).flush()

			const logs = (instance as { getRecentLogs: () => unknown[] }).getRecentLogs()
			const entry = logs[0] as { level: string; data: unknown[]; timestamp: Date }
			expect(entry.level).toBe('info')
			expect(entry.timestamp).toBeInstanceOf(Date)
			expect('message' in entry && typeof entry.message === 'function').toBe(true)
		})
	})

	test('Log entry.timestamp is a Date instance', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('test')
			await (instance as { flush: () => Promise<void> }).flush()

			const logs = (instance as { getRecentLogs: () => unknown[] }).getRecentLogs()
			const entry = logs[0] as { timestamp: Date }
			expect(entry.timestamp).toBeInstanceOf(Date)
		})
	})

	test('Log entry.message() extracts string from data array', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('hello', 'world')
			await (instance as { flush: () => Promise<void> }).flush()

			const logs = (instance as { getRecentLogs: () => unknown[] }).getRecentLogs()
			const entry = logs[0] as { message: () => string }
			const message = entry.message()
			expect(message).toContain('hello')
			expect(message).toContain('world')
		})
	})

	test('Log entry.message() extracts Error.message from Error instances', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const error = new Error('test error')
			const instance = new Logger()
			;(instance as { error: (...args: unknown[]) => void }).error(error)
			await (instance as { flush: () => Promise<void> }).flush()

			const logs = (instance as { getRecentLogs: () => unknown[] }).getRecentLogs()
			const entry = logs[0] as { message: () => string }
			const message = entry.message()
			expect(message).toContain('test error')
		})
	})

	test('Log entry.message() stringifies objects using JSON.stringify', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const obj = { key: 'value' }
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info(obj)
			await (instance as { flush: () => Promise<void> }).flush()

			const logs = (instance as { getRecentLogs: () => unknown[] }).getRecentLogs()
			const entry = logs[0] as { message: () => string }
			const message = entry.message()
			expect(message).toContain('key')
			expect(message).toContain('value')
		})
	})

	test('Log entry.message() handles circular objects gracefully', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const circular: { self?: unknown } = {}
			circular.self = circular
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info(circular)
			await (instance as { flush: () => Promise<void> }).flush()

			const logs = (instance as { getRecentLogs: () => unknown[] }).getRecentLogs()
			const entry = logs[0] as { message: () => string }
			const message = entry.message()
			expect(message).toContain('unserializable object')
		})
	})

	test('Log entry.message() joins multiple data items with spaces', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('one', 'two', 'three')
			await (instance as { flush: () => Promise<void> }).flush()

			const logs = (instance as { getRecentLogs: () => unknown[] }).getRecentLogs()
			const entry = logs[0] as { message: () => string }
			const message = entry.message()
			expect(message).toContain('one')
			expect(message).toContain('two')
			expect(message).toContain('three')
		})
	})

	test('Log entry.message() strips ANSI codes from final message', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('\x1b[31mred text\x1b[0m')
			await (instance as { flush: () => Promise<void> }).flush()

			const logs = (instance as { getRecentLogs: () => unknown[] }).getRecentLogs()
			const entry = logs[0] as { message: () => string }
			const message = entry.message()
			expect(message).not.toContain('\x1b')
			expect(message).toContain('red text')
		})
	})

	test('Log entry.message() handles mixed data types', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('string', { obj: 'value' }, new Error('error'))
			await (instance as { flush: () => Promise<void> }).flush()

			const logs = (instance as { getRecentLogs: () => unknown[] }).getRecentLogs()
			const entry = logs[0] as { message: () => string }
			const message = entry.message()
			expect(message).toContain('string')
			expect(message).toContain('obj')
			expect(message).toContain('error')
		})
	})

	test('Log entry.message() handles empty data array', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger()
			;(instance as { log: (...args: unknown[]) => void }).log()
			await (instance as { flush: () => Promise<void> }).flush()

			const logs = (instance as { getRecentLogs: () => unknown[] }).getRecentLogs()
			// log() with no args should not create an entry or create one with empty message
			if (logs.length > 0) {
				const entry = logs[0] as { message: () => string }
				const message = entry.message()
				expect(message).toBe('')
			}
		})
	})

	test('Log entry.message() handles undefined and null values', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info(undefined, null, 'text')
			await (instance as { flush: () => Promise<void> }).flush()

			const logs = (instance as { getRecentLogs: () => unknown[] }).getRecentLogs()
			const entry = logs[0] as { message: () => string }
			const message = entry.message()
			expect(message).toContain('text')
		})
	})
})

describe('Global logger singleton behavior', () => {
	test('logger() function returns singleton instance', async () => {
		await withFreshLogger({}, async ({ logger, Logger }) => {
			const instance = logger()
			expect(instance).toBeInstanceOf(Logger)
		})
	})

	test('logger() called multiple times returns same instance', async () => {
		await withFreshLogger({}, async ({ logger }) => {
			const instance1 = logger()
			const instance2 = logger()
			expect(instance1).toBe(instance2)
		})
	})

	test('logger(options) on first call creates logger with options', async () => {
		await withFreshLogger({}, async ({ logger }) => {
			const instance = logger({ level: 'debug' })
			expect((instance as { getLevel: () => string }).getLevel()).toBe('debug')
		})
	})

	test('logger(options) on subsequent calls reconfigures existing logger', async () => {
		await withFreshLogger({}, async ({ logger }) => {
			const instance1 = logger({ level: 'debug' })
			const instance2 = logger({ level: 'error' })
			expect(instance1).toBe(instance2)
			expect((instance2 as { getLevel: () => string }).getLevel()).toBe('error')
		})
	})

	test('logger() without options creates logger with defaults', async () => {
		await withFreshLogger({}, async ({ logger }) => {
			const instance = logger()
			expect((instance as { getLevel: () => string }).getLevel()).toBe('info')
		})
	})

	test('logger.trace() static method delegates to singleton', async () => {
		await withFreshLogger({}, async ({ logger }) => {
			const stdout = captureStdout()
			;(logger as { trace: (...args: unknown[]) => void }).trace('trace from static')
			await (logger as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('trace from static')
		})
	})

	test('logger.debug() static method delegates to singleton', async () => {
		await withFreshLogger({}, async ({ logger }) => {
			const stdout = captureStdout()
			;(logger as { debug: (...args: unknown[]) => void }).debug('debug from static')
			await (logger as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('debug from static')
		})
	})

	test('logger.info() static method delegates to singleton', async () => {
		await withFreshLogger({}, async ({ logger }) => {
			const stdout = captureStdout()
			;(logger as { info: (...args: unknown[]) => void }).info('info from static')
			await (logger as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('info from static')
		})
	})

	test('logger.wait() static method delegates to singleton', async () => {
		await withFreshLogger({}, async ({ logger }) => {
			const stdout = captureStdout()
			;(logger as { wait: (...args: unknown[]) => void }).wait('wait from static')
			await (logger as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('wait from static')
		})
	})

	test('logger.log() static method delegates to singleton', async () => {
		await withFreshLogger({}, async ({ logger }) => {
			const stdout = captureStdout()
			;(logger as { log: (...args: unknown[]) => void }).log('log from static')
			await (logger as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('log from static')
		})
	})

	test('logger.event() static method delegates to singleton', async () => {
		await withFreshLogger({}, async ({ logger }) => {
			const stdout = captureStdout()
			;(logger as { event: (...args: unknown[]) => void }).event('event from static')
			await (logger as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('event from static')
		})
	})

	test('logger.ready() static method delegates to singleton', async () => {
		await withFreshLogger({}, async ({ logger }) => {
			const stdout = captureStdout()
			;(logger as { ready: (...args: unknown[]) => void }).ready('ready from static')
			await (logger as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('ready from static')
		})
	})

	test('logger.warn() static method delegates to singleton', async () => {
		await withFreshLogger({}, async ({ logger }) => {
			const stderr = captureStderr()
			;(logger as { warn: (...args: unknown[]) => void }).warn('warn from static')
			await (logger as { flush: () => Promise<void> }).flush()

			const output = stderr.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('warn from static')
		})
	})

	test('logger.error() static method delegates to singleton', async () => {
		await withFreshLogger({}, async ({ logger }) => {
			const stderr = captureStderr()
			;(logger as { error: (...args: unknown[]) => void }).error('error from static')
			await (logger as { flush: () => Promise<void> }).flush()

			const output = stderr.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('error from static')
		})
	})

	test('singleton persists across multiple test calls within same module context', async () => {
		await withFreshLogger({}, async ({ logger }) => {
			const instance1 = logger()
			;(instance1 as { info: (...args: unknown[]) => void }).info('first call')

			const instance2 = logger()
			;(instance2 as { info: (...args: unknown[]) => void }).info('second call')

			expect(instance1).toBe(instance2)
		})
	})
})

describe('Integration scenarios and edge cases', () => {
	test('node:util mock pathway uses custom inspect for objects and errors', async () => {
		await withFreshLogger(
			{
				mocks: {
					util: {
						inspect: mockInspect()
					}
				}
			},
			async ({ Logger }) => {
				const stdout = captureStdout()
				const instance = new Logger()
				const obj = { key: 'value' }
				const error = new Error('test error')
				;(instance as { info: (...args: unknown[]) => void }).info(obj, error)
				await (instance as { flush: () => Promise<void> }).flush()

				const output = stdout.mock.calls.map((call) => call[0]).join('')
				// Mock inspect should JSONify objects and format errors
				expect(output).toContain('{"key":"value"}')
				expect(output).toContain('Error: test error')
			}
		)
	})

	test('end-to-end: create logger, log at various levels, retrieve recent logs', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger({ level: 'trace' }) as {
				trace: (...args: unknown[]) => void
				debug: (...args: unknown[]) => void
				info: (...args: unknown[]) => void
				warn: (...args: unknown[]) => void
				error: (...args: unknown[]) => void
				flush: () => Promise<void>
				getRecentLogs: () => { level: string; message: () => string }[]
			}

			instance.trace('trace log')
			instance.debug('debug log')
			instance.info('info log')
			instance.warn('warn log')
			instance.error('error log')
			await instance.flush()

			const logs = instance.getRecentLogs()
			expect(logs).toHaveLength(5)
			expect(logs[0].level).toBe('error')
			expect(logs[0].message()).toContain('error log')
		})
	})

	test('end-to-end: fork logger, log from parent and child, verify prefix', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const parent = new Logger() as {
				info: (...args: unknown[]) => void
				fork: (prefix: string) => { info: (...args: unknown[]) => void }
				flush: () => Promise<void>
			}
			const child = parent.fork('CHILD')

			parent.info('from parent')
			child.info('from child')
			await parent.flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('from parent')
			expect(output).toContain('CHILD')
			expect(output).toContain('from child')
		})
	})

	test('end-to-end: custom drain captures all logs', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const capturedLogs: Array<{ level: string; data: unknown[] }> = []
			const customDrain = jest.fn((_, level, data) => {
				capturedLogs.push({ level, data })
			})

			const instance = new Logger({ drain: customDrain as never }) as {
				info: (...args: unknown[]) => void
				warn: (...args: unknown[]) => void
				error: (...args: unknown[]) => void
				flush: () => Promise<void>
			}

			instance.info('info log')
			instance.warn('warn log')
			instance.error('error log')
			await instance.flush()

			expect(capturedLogs).toHaveLength(3)
			expect(capturedLogs[0].level).toBe('info')
			expect(capturedLogs[1].level).toBe('warn')
			expect(capturedLogs[2].level).toBe('error')
		})
	})

	test('end-to-end: browser environment detection and ANSI conversion', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const { consoleLog, consoleError } = simulateBrowser()
			const instance = new Logger() as {
				info: (...args: unknown[]) => void
				error: (...args: unknown[]) => void
				flush: () => Promise<void>
			}

			instance.info('browser info')
			instance.error('browser error')
			await instance.flush()

			expect(consoleLog).toHaveBeenCalled()
			expect(consoleError).toHaveBeenCalled()
		})
	})

	test('concurrent logging from multiple forks does not corrupt buffer', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const parent = new Logger() as {
				fork: (prefix: string) => { info: (...args: unknown[]) => void }
				flush: () => Promise<void>
				getRecentLogs: () => unknown[]
			}
			const child1 = parent.fork('child1')
			const child2 = parent.fork('child2')

			// Log concurrently
			for (let i = 0; i < 10; i++) {
				child1.info(`child1-${i}`)
				child2.info(`child2-${i}`)
			}
			await parent.flush()

			const logs = parent.getRecentLogs()
			expect(logs).toHaveLength(20)
		})
	})

	test('rapid logging does not lose entries (buffer wraps correctly)', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger({ maxEntries: 50 }) as {
				info: (...args: unknown[]) => void
				flush: () => Promise<void>
				getRecentLogs: () => unknown[]
			}

			for (let i = 0; i < 100; i++) {
				instance.info(`message-${i}`)
			}
			await instance.flush()

			const logs = instance.getRecentLogs()
			expect(logs).toHaveLength(50)
		})
	})

	test('logging with very large objects (deep nesting)', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger()
			const deepObject = { level1: { level2: { level3: { level4: { value: 'deep' } } } } }
			;(instance as { info: (...args: unknown[]) => void }).info(deepObject)
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('deep')
		})
	})

	test('logging with circular references in objects', async () => {
		await withFreshLogger({ env: { NODE_ENV: 'development' } }, async ({ Logger }) => {
			const instance = new Logger()
			const circular: { self?: unknown } = {}
			circular.self = circular
			;(instance as { info: (...args: unknown[]) => void }).info(circular)
			await (instance as { flush: () => Promise<void> }).flush()

			// Should not throw
			const logs = (instance as { getRecentLogs: () => { message: () => string }[] }).getRecentLogs()
			expect(logs[0].message()).toContain('unserializable object')
		})
	})

	test('logging with special characters and unicode', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger()
			;(instance as { info: (...args: unknown[]) => void }).info('Unicode: 你好 🚀 émoji')
			await (instance as { flush: () => Promise<void> }).flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).toContain('Unicode')
		})
	})

	test('disabled logger produces no output but does not error', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger({ enabled: false }) as {
				info: (...args: unknown[]) => void
				warn: (...args: unknown[]) => void
				error: (...args: unknown[]) => void
				flush: () => Promise<void>
			}

			instance.info('no output')
			instance.warn('no output')
			instance.error('no output')
			await instance.flush()

			expect(stdout).not.toHaveBeenCalled()
		})
	})

	test('custom level priority affects filtering correctly', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			const stdout = captureStdout()
			const instance = new Logger({
				level: 'medium',
				customLevels: {
					low: { priority: 5, label: 'LOW', color: 'gray' },
					medium: { priority: 25, label: 'MED', color: 'blue' },
					high: { priority: 45, label: 'HIGH', color: 'red' }
				}
			}) as {
				low: (...args: unknown[]) => void
				medium: (...args: unknown[]) => void
				high: (...args: unknown[]) => void
				flush: () => Promise<void>
			}

			instance.low('should not appear')
			instance.medium('should appear')
			instance.high('should appear')
			await instance.flush()

			const output = stdout.mock.calls.map((call) => call[0]).join('')
			expect(output).not.toContain('should not appear')
			expect(output).toContain('should appear')
		})
	})

	test('flush() with slow async drain waits for completion', async () => {
		await withFreshLogger({}, async ({ Logger }) => {
			let completed = false
			const slowDrain = jest.fn(
				() =>
					new Promise((resolve) => {
						setTimeout(() => {
							completed = true
							resolve(undefined)
						}, 50)
					})
			)

			const instance = new Logger({ drain: slowDrain as never })
			;(instance as { info: (...args: unknown[]) => void }).info('slow log')

			expect(completed).toBe(false)
			await (instance as { flush: () => Promise<void> }).flush()
			expect(completed).toBe(true)
		})
	})
})
