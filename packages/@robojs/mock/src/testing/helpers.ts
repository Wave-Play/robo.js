/**
 * Testing Helpers
 *
 * Helper functions for writing integration tests with the mock server.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { basename, join } from 'node:path'
import type { ExpectActionOptions, RecordedAction, WaitForActionOptions, CreateTestSessionConfig } from './types.js'
import type { AssertionResult } from '../session/registry.js'
import { getSessionActions, getMockConfig, createSession } from './control-api.js'
import { recordAssertion as registryRecordAssertion, registerTestFile, setTestFileRecordingPath } from '../session/registry.js'
import { getMockPluginPrefix } from '../utils/server.js'
import { readServerInfo, STANDALONE_MOCK_PORT } from '../utils/server-info.js'

/**
 * Handle for managing a log drain added to the logger.
 * Allows flushing pending writes and removing the drain.
 */
interface DrainHandle {
	id: string
	remove: () => boolean
	flush: () => Promise<void>
}

// ============================================================================
// Wait Helpers
// ============================================================================

/**
 * Format a summary of recorded actions for inclusion in timeout error messages.
 * Helps developers debug why a waited-for action was not found.
 */
function formatActionSummary(actions: RecordedAction[], expectedType: string, hadCustomFilter: boolean): string {
	if (actions.length === 0) {
		return 'No actions were recorded during the wait period.'
	}

	// Separate actions by whether they match the expected type
	const matchingType = actions.filter((a) => a.type === expectedType)
	const otherActions = actions.filter((a) => a.type !== expectedType)

	const lines: string[] = []

	// If there are actions of the right type but none passed the filter
	if (matchingType.length > 0 && hadCustomFilter) {
		lines.push(`Found ${matchingType.length} action(s) of type "${expectedType}", but none matched the filter:`)
		const toShow = matchingType.slice(0, 5)
		for (const action of toShow) {
			let dataPreview: string
			try {
				dataPreview = JSON.stringify(action.data)
				if (dataPreview.length > 200) {
					dataPreview = dataPreview.slice(0, 200) + '...'
				}
			} catch {
				dataPreview = '[unserializable]'
			}
			lines.push(`  - ${dataPreview}`)
		}
		if (matchingType.length > 5) {
			lines.push(`  ... and ${matchingType.length - 5} more`)
		}
	}

	// List other action types with counts
	if (otherActions.length > 0) {
		const typeCounts = new Map<string, number>()
		for (const action of otherActions) {
			typeCounts.set(action.type, (typeCounts.get(action.type) ?? 0) + 1)
		}
		lines.push(`Found ${otherActions.length} action(s) of other types:`)
		for (const [type, count] of typeCounts) {
			lines.push(`  - ${type}: ${count}`)
		}
	}

	return lines.length > 0 ? lines.join('\n') : 'No actions were recorded during the wait period.'
}

/**
 * Wait for a specific action to be recorded
 */
export async function waitForAction(
	sessionId: string,
	options: WaitForActionOptions | string
): Promise<RecordedAction[]> {
	const opts: WaitForActionOptions =
		typeof options === 'string' ? { type: options } : options
	const timeout = opts.timeout ?? getMockConfig().defaultTimeout
	const startTime = Date.now()
	// Grace window to avoid missing actions that are recorded during the triggering
	// request (e.g. dispatchEvent/dispatchInteraction) before this function begins polling.
	// This can happen when the bot responds very quickly and the control API request
	// takes longer than expected.
	const querySince = startTime - 5000

	while (Date.now() - startTime < timeout) {
		const { actions } = await getSessionActions(sessionId, {
			type: opts.type,
			since: querySince
		})

		// Filter by type if specified
		let filtered = actions
		if (opts.type) {
			filtered = actions.filter((a) => a.type === opts.type)
		}

		// Apply custom filter if provided
		if (opts.filter) {
			filtered = filtered.filter(opts.filter)
		}

		if (filtered.length > 0) {
			return filtered
		}

		// Poll every 100ms
		await sleep(100)
	}

	// Fetch all actions (unfiltered by type) to build a diagnostic summary
	const { actions: allActions } = await getSessionActions(sessionId, {
		since: querySince
	})
	const summary = formatActionSummary(allActions, opts.type, !!opts.filter)

	throw new Error(
		`Timeout waiting for action "${opts.type}" after ${timeout}ms\n${summary}`
	)
}

/**
 * Wait for any action matching a filter
 */
export async function waitForAnyAction(
	sessionId: string,
	filter: (action: RecordedAction) => boolean,
	timeout?: number
): Promise<RecordedAction> {
	const actualTimeout = timeout ?? getMockConfig().defaultTimeout
	const startTime = Date.now()
	const querySince = startTime - 5000

	while (Date.now() - startTime < actualTimeout) {
		const { actions } = await getSessionActions(sessionId, {
			since: querySince
		})

		const match = actions.find(filter)
		if (match) {
			return match
		}

		await sleep(100)
	}

	// Fetch all actions to build a diagnostic summary
	const { actions: allActions } = await getSessionActions(sessionId, {
		since: querySince
	})
	const summary = formatActionSummary(allActions, '(custom filter)', true)

	throw new Error(`Timeout waiting for matching action after ${actualTimeout}ms\n${summary}`)
}

/**
 * Wait for a message to be sent by the bot
 */
export async function waitForMessage(
	sessionId: string,
	options?: {
		channelId?: string
		content?: string | RegExp
		timeout?: number
	}
): Promise<RecordedAction> {
	return waitForAnyAction(
		sessionId,
		(action) => {
			if (action.type !== 'message_sent') return false

			const data = action.data as { channel_id?: string; content?: string }

			if (options?.channelId && data.channel_id !== options.channelId) {
				return false
			}

			if (options?.content) {
				if (typeof options.content === 'string') {
					return data.content === options.content
				}
				return options.content.test(data.content ?? '')
			}

			return true
		},
		options?.timeout
	)
}

/**
 * Wait for an interaction response
 */
export async function waitForInteractionResponse(
	sessionId: string,
	options?: {
		type?: number
		timeout?: number
	}
): Promise<RecordedAction> {
	return waitForAnyAction(
		sessionId,
		(action) => {
			if (action.type !== 'interaction_response') return false

			if (options?.type !== undefined) {
				const data = action.data as { type?: number }
				return data.type === options.type
			}

			return true
		},
		options?.timeout
	)
}

// ============================================================================
// Historical Action Helpers
// ============================================================================

/**
 * Get all historical actions from a session (including those from before test started).
 *
 * This is useful for testing lifecycle hooks like `ready` events that fire during
 * bot startup, before your test code begins waiting for actions.
 *
 * @example
 * ```typescript
 * // Check what happened during startup
 * const actions = await getHistoricalActions(bot.sessionId, {
 *   type: 'gateway_presence_update'
 * })
 * expect(actions.length).toBeGreaterThan(0)
 * ```
 */
export async function getHistoricalActions(
	sessionId: string,
	options?: {
		/** Filter by action type */
		type?: string
		/** Custom filter function */
		filter?: (action: RecordedAction) => boolean
	}
): Promise<RecordedAction[]> {
	// Query all actions without a `since` filter
	const { actions } = await getSessionActions(sessionId, {
		type: options?.type
	})

	// Apply custom filter if provided
	if (options?.filter) {
		return actions.filter(options.filter)
	}

	return actions
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Record an assertion for UI persistence
 */
export function recordAssertion(sessionId: string, assertion: AssertionResult): void {
	registryRecordAssertion(sessionId, assertion)
}

/**
 * Deep equality check for assertion comparison
 */
export function deepEquals(actual: unknown, expected: unknown): boolean {
	// Handle Jest matchers (expect.stringContaining, etc.)
	if (expected && typeof expected === 'object' && 'asymmetricMatch' in expected) {
		return (expected as { asymmetricMatch: (v: unknown) => boolean }).asymmetricMatch(actual)
	}

	if (actual === expected) return true
	if (actual === null || expected === null) return false
	if (actual === undefined || expected === undefined) return false

	if (typeof actual !== typeof expected) return false

	if (Array.isArray(actual) && Array.isArray(expected)) {
		if (actual.length !== expected.length) return false
		return actual.every((item, index) => deepEquals(item, expected[index]))
	}

	if (typeof actual === 'object' && typeof expected === 'object') {
		const actualObj = actual as Record<string, unknown>
		const expectedObj = expected as Record<string, unknown>
		const keys = Object.keys(expectedObj)

		return keys.every((key) => deepEquals(actualObj[key], expectedObj[key]))
	}

	return false
}

/**
 * Generate a diff string for UI display
 */
export function generateDiff(expected: unknown, actual: unknown): string {
	const expectedStr = JSON.stringify(expected, null, 2)
	const actualStr = JSON.stringify(actual, null, 2)

	if (expectedStr === actualStr) {
		return 'Values are equal'
	}

	return `Expected:\n${expectedStr}\n\nActual:\n${actualStr}`
}

/**
 * Wait for an action and assert it matches expected data
 *
 * This helper:
 * 1. Waits for an action of the specified type
 * 2. Records the assertion for UI persistence
 * 3. Returns the matching action
 */
export async function expectAction(
	sessionId: string,
	options: ExpectActionOptions
): Promise<RecordedAction> {
	const { description, type, expected, timeout } = options

	try {
		// Wait for an action that matches the expected data.
		// Many bots can emit multiple actions of the same type in response to a single event
		// (e.g. multiple `message_sent` handlers). Filtering here avoids flakey ordering issues.
		const actions = await waitForAction(sessionId, {
			type,
			timeout,
			filter: expected
				? (action) => deepEquals(action.data, expected)
				: undefined
		})
		const action = actions[0]
		const actual = action?.data

		// Check if it matches
		const passed = deepEquals(actual, expected)

		// Record assertion for UI
		recordAssertion(sessionId, {
			description,
			passed,
			expected,
			actual,
			diff: passed ? undefined : generateDiff(expected, actual)
		})

		// If not passed, throw for Jest
		if (!passed) {
			const error = new Error(
				`Assertion failed: ${description}\n${generateDiff(expected, actual)}`
			)
			error.name = 'AssertionError'
			throw error
		}

		return action
	} catch (error) {
		// Record timeout as failed assertion with diagnostic details
		if ((error as Error).message.includes('Timeout')) {
			recordAssertion(sessionId, {
				description,
				passed: false,
				expected,
				actual: undefined,
				diff: (error as Error).message
			})
		}
		throw error
	}
}

/**
 * Assert that no action of a type was recorded
 */
export async function expectNoAction(
	sessionId: string,
	options: {
		description: string
		type: string
		waitMs?: number
	}
): Promise<void> {
	const { description, type, waitMs = 500 } = options

	// Wait a bit to give time for action to appear
	await sleep(waitMs)

	const { actions } = await getSessionActions(sessionId, { type })
	const hasAction = actions.some((a) => a.type === type)

	recordAssertion(sessionId, {
		description,
		passed: !hasAction,
		expected: 'No action',
		actual: hasAction ? `Found ${actions.length} action(s)` : 'No action',
		diff: hasAction ? `Found unexpected ${type} action(s)` : undefined
	})

	if (hasAction) {
		throw new Error(`Assertion failed: ${description} - Found unexpected ${type} action`)
	}
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sleep for a number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Generate a Discord snowflake ID for testing
 */
export function generateSnowflake(): string {
	const timestamp = BigInt(Date.now() - 1420070400000) << 22n
	const random = BigInt(Math.floor(Math.random() * 4194303))
	return (timestamp | random).toString()
}

/**
 * Wait for the mock server to be ready
 */
export async function waitForMockServer(options?: {
	url?: string
	timeout?: number
	interval?: number
}): Promise<void> {
	const url = options?.url ?? getMockConfig().controlUrl
	const timeout = options?.timeout ?? 30000
	const interval = options?.interval ?? 500
	const startTime = Date.now()

	while (Date.now() - startTime < timeout) {
		try {
			const response = await fetch(`${url}/sessions`)
			if (response.ok) {
				return
			}
		} catch {
			// Server not ready yet
		}

		await sleep(interval)
	}

	throw new Error(`Mock server not ready after ${timeout}ms`)
}

// ============================================================================
// Bot Lifecycle Helpers
// ============================================================================

/**
 * Result of starting a mock Robo
 */
export interface MockRoboHandle {
	/** Session ID the bot is connected to */
	sessionId: string
	/** Session token */
	token: string
	/** Bot user info */
	botUser: { id: string; username: string }
	/** Available guilds */
	guilds: Array<{ id: string; name: string }>
	/** Available channels */
	channels: Array<{ id: string; name: string; guildId?: string; type: number }>
	/** Default guild ID */
	guildId: string
	/** The Discord.js client (from @robojs/discordjs) - null when hmr: true */
	client: unknown
	/** The port the Robo server is running on */
	serverPort: number
	/** Stop the bot and clean up */
	stop: () => Promise<void>
	/** Child process (only when hmr: true) */
	process?: ChildProcess
	/** Get current HMR reload count - use before file changes to track position (only when hmr: true) */
	getHmrCount?: () => number
	/** Get current restart count - use before file changes to track position (only when hmr: true) */
	getRestartCount?: () => number
	/** Wait for HMR reload to complete (only when hmr: true). Pass fromCount from getHmrCount() captured before file changes. */
	waitForHmrReload?: (timeout?: number, fromCount?: number) => Promise<void>
	/** Wait for full restart to complete (only when hmr: true). Pass fromCount from getRestartCount() captured before file changes. */
	waitForFullRestart?: (timeout?: number, fromCount?: number) => Promise<void>
}

/**
 * Options for starting a mock Robo
 */
export interface StartMockRoboOptions {
	/** Session name */
	name?: string
	/** Mock server port (auto-discovered if not specified) */
	port?: number
	/** Timeout for bot to connect in ms (default: 30000) */
	timeout?: number
	/** Enable verbose output (shows logs in console alongside file) */
	verbose?: boolean
	/** Test file path for registry tracking and log file naming (use __filename) */
	testFilePath?: string
	/**
	 * Enable file logging for this test.
	 * - true: Auto-name from testFilePath (e.g., "ping.test.log")
	 * - string: Custom log file path
	 * - false: Disable file logging
	 * - undefined: Auto-enable when running under `robo mock test` with testFilePath
	 */
	logFile?: boolean | string
	/**
	 * Log level for file output.
	 * @default 'debug'
	 */
	logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error'
	/**
	 * Enable HMR mode - spawns `robo dev --hmr` as child process
	 * instead of running Robo.start() directly.
	 * Required for testing hot module replacement.
	 *
	 * When enabled:
	 * - `client` will be null (runs in separate process)
	 * - `process` will contain the child process
	 * - `waitForHmrReload()` and `waitForFullRestart()` will be available
	 */
	hmr?: boolean
	/**
	 * Skip waiting for a Discord Gateway bot connection.
	 * Use this for Discord Activities or other projects with `disableBot: true`
	 * that don't connect to the Gateway.
	 *
	 * When enabled, waits for the Robo HTTP server to be ready instead of
	 * waiting for a Gateway connection.
	 */
	activity?: boolean
}

/**
 * Discover the mock server port dynamically.
 *
 * Resolution order:
 * 1. Explicit port passed as parameter
 * 2. ROBO_MOCK_PORT environment variable
 * 3. Server info file (.robo/mock/server.json) - for standalone mock server
 * 4. STANDALONE_MOCK_PORT (6625) as final fallback
 */
async function discoverMockPort(explicitPort?: number): Promise<number> {
	// 1. Explicit port takes priority
	if (explicitPort !== undefined) {
		return explicitPort
	}

	// 2. Environment variable
	if (process.env.ROBO_MOCK_PORT) {
		return parseInt(process.env.ROBO_MOCK_PORT, 10)
	}

	// 3. Server info file (standalone mock server)
	const serverInfo = await readServerInfo()
	if (serverInfo) {
		return serverInfo.port
	}

	// 4. Fallback to standalone mock port
	return STANDALONE_MOCK_PORT
}


/**
 * Start a Robo connected to the mock server
 *
 * When `hmr: false` (default): Runs Robo.start() directly in the test process,
 * giving you access to the Discord.js client and all bot internals.
 *
 * When `hmr: true`: Spawns `robo dev --hmr` as a child process for HMR testing.
 * The client will be null but you get `waitForHmrReload()` and `waitForFullRestart()`.
 *
 * @example
 * ```typescript
 * // Standard mode - direct access to client
 * let bot: MockRoboHandle
 *
 * beforeAll(async () => {
 *   bot = await startMockRobo({ name: 'my-test', testFilePath: __filename })
 * })
 *
 * afterAll(async () => {
 *   await bot.stop()
 * })
 *
 * // HMR mode - for testing hot module replacement
 * let bot: MockRoboHandle
 *
 * beforeAll(async () => {
 *   bot = await startMockRobo({ name: 'hmr-test', testFilePath: __filename, hmr: true })
 * })
 *
 * it('reloads handlers', async () => {
 *   // Modify a file...
 *   await bot.waitForHmrReload!()
 *   // Test the updated handler...
 * })
 * ```
 */
export async function startMockRobo(options: StartMockRoboOptions = {}): Promise<MockRoboHandle> {
	if (options.hmr) {
		return startHmrMode(options)
	}
	return startDirectMode(options)
}

/**
 * HMR mode implementation - spawns robo dev --hmr as child process
 */
async function startHmrMode(options: StartMockRoboOptions): Promise<MockRoboHandle> {
	const port = await discoverMockPort(options.port)
	const prefix = getMockPluginPrefix()

	// Create session
	const sessionConfig: CreateTestSessionConfig = {}
	if (options.name) {
		sessionConfig.name = options.name
	}

	const session = await createSession(sessionConfig)
	const sessionId = session.id

	// Register test file if provided
	if (options.testFilePath) {
		registerTestFile(sessionId, options.testFilePath)
	}

		// Spawn robo dev --hmr
		const devArgs = ['robo', 'dev', '--hmr']
		if (options.verbose) {
			devArgs.push('--verbose')
		}
		const devProcess = spawn('npx', devArgs, {
			cwd: process.cwd(),
			env: {
				...process.env,
				NODE_ENV: 'development',
			ROBO_MOCK_MODE: 'true',
			ROBO_MOCK_PORT: String(port),
			ROBO_MOCK_SESSION_ID: sessionId,
			DISCORD_TOKEN: session.token,
			DISCORD_REST_API: `http://localhost:${port}${prefix}/api`,
			__ROBO_MOCK_CONNECT_EXISTING: 'true',
			__ROBO_MOCK_SERVER_PORT: String(port)
		},
		stdio: ['pipe', 'pipe', 'pipe']
	})

	// Track HMR and restart events via counters
	let hmrReloadCount = 0
	let fullRestartCount = 0
	 
	const ansiPattern = /\x1B\[[0-9;]*[a-zA-Z]/g
	const stripAnsi = (str: string) => str.replace(ansiPattern, '')

	const processOutput = (text: string) => {
		const cleanText = stripAnsi(text)
		// Count HMR reload messages
		const hmrMatches = cleanText.match(/\[HMR\] Reloaded/g)
		if (hmrMatches) {
			hmrReloadCount += hmrMatches.length
		}
		// Count full restart messages
		if (/Restarting Robo|full restart/.test(cleanText)) {
			fullRestartCount++
		}
	}

	devProcess.stdout?.on('data', (chunk: Buffer) => {
		const text = chunk.toString()
		processOutput(text)
		if (options.verbose) {
			process.stdout.write(chunk)
		}
	})
	devProcess.stderr?.on('data', (chunk: Buffer) => {
		const text = chunk.toString()
		processOutput(text)
		if (options.verbose) {
			process.stderr.write(chunk)
		}
	})

	// Wait for readiness
	const timeout = options.timeout ?? 60000
	// The Robo server port (where API routes are served) is separate from the mock server port
	const serverPort = parseInt(process.env.PORT ?? '3000')
	if (options.activity) {
		// Activity mode: wait for the HTTP server to be ready (no Gateway connection)
		await waitForServerReady(serverPort, timeout)
	} else {
		// Bot mode: wait for Gateway connection
		await waitForBotConnection(sessionId, timeout)
	}

	// HMR-specific methods - use counters to detect changes regardless of timing
	// Get current counts so tests can capture position BEFORE making file changes
	const getHmrCount = () => hmrReloadCount
	const getRestartCount = () => fullRestartCount

	const waitForHmrReload = async (hmrTimeout = 15000, fromCount?: number): Promise<void> => {
		// Use provided count or capture current count
		const startCount = fromCount ?? hmrReloadCount
		const startTime = Date.now()
		let pollInterval = 100

		// Wait at least 300ms before checking to avoid catching stale reloads from startup
		await sleep(300)

		while (Date.now() - startTime < hmrTimeout) {
			if (hmrReloadCount > startCount) {
				// Wait for handler to fully reload and propagate
				// Increased from 500ms to 750ms for better reliability on slower CI systems
				await sleep(750)
				return
			}
			await sleep(pollInterval)
			// Exponential backoff: 100ms → 120ms → 144ms → ... capped at 300ms
			// This reduces CPU usage during longer waits while still being responsive
			pollInterval = Math.min(Math.round(pollInterval * 1.2), 300)
		}
		throw new Error(`HMR reload not detected after ${hmrTimeout}ms (startCount=${startCount}, currentCount=${hmrReloadCount})`)
	}

	const waitForFullRestart = async (restartTimeout = 30000, fromCount?: number): Promise<void> => {
		// Use provided count or capture current count
		let startCount = fromCount ?? fullRestartCount
		const startTime = Date.now()

		// Restart log messages can be emitted without an actual disconnect/reconnect cycle
		// (e.g. "Falling back to full restart..."). To avoid false positives, require the
		// gateway connection count to drop to 0 and then recover.
		while (Date.now() - startTime < restartTimeout) {
			if (fullRestartCount > startCount) {
				startCount = fullRestartCount

				// Give the process a chance to disconnect before considering it a restart.
				// If we never observe a disconnect, keep waiting for the next restart signal.
				const remaining = restartTimeout - (Date.now() - startTime)
				const disconnectTimeout = Math.min(5000, Math.max(500, remaining))
				const didDisconnect = await waitForBotDisconnect(sessionId, disconnectTimeout).then(
					() => true,
					() => false
				)

				if (!didDisconnect) {
					await sleep(100)
					continue
				}

				// Now wait for the bot to reconnect.
				await waitForBotConnection(sessionId, Math.min(30000, Math.max(500, remaining)))
				return
			}
			await sleep(100)
		}

		throw new Error(`Full restart not detected after ${restartTimeout}ms (startCount=${fromCount ?? 'auto'}, currentCount=${fullRestartCount})`)
	}

	return {
		sessionId,
		token: session.token,
		botUser: session.botUser,
		guilds: session.guilds,
		channels: session.channels,
		guildId: session.guildId,
		client: null, // Not available in HMR mode (different process)
		serverPort,
		process: devProcess,
		getHmrCount,
		getRestartCount,
		waitForHmrReload,
		waitForFullRestart,
		stop: async () => {
			devProcess.kill('SIGTERM')
			await new Promise<void>((resolve) => {
				const forceKillTimeout = setTimeout(() => {
					devProcess.kill('SIGKILL')
					resolve()
				}, 5000)

				devProcess.on('exit', () => {
					clearTimeout(forceKillTimeout)
					resolve()
				})
			})

			// Save the recording
			try {
				const config = getMockConfig()
				const response = await fetch(`${config.controlUrl}/sessions/${sessionId}/recording`, {
					method: 'POST'
				})
				if (response.ok) {
					setTestFileRecordingPath(sessionId, `${sessionId}.json`)
				}
			} catch {
				// Recording save failed, but don't block the stop
			}
		}
	}
}

/**
 * Direct mode implementation - runs Robo.start() in test process
 */
async function startDirectMode(options: StartMockRoboOptions = {}): Promise<MockRoboHandle> {
	const port = await discoverMockPort(options.port)
	const timeout = options.timeout ?? 30000

	// Create a session on the mock server
	const sessionConfig: CreateTestSessionConfig = {}
	if (options.name) {
		sessionConfig.name = options.name
	}

	const session = await createSession(sessionConfig)
	const sessionId = session.id

	// Register with test registry if test file path provided
	if (options.testFilePath) {
		registerTestFile(sessionId, options.testFilePath)
	}

	// Set up environment for mock mode BEFORE importing Robo
	// Mark as connecting to existing mock server so the plugin doesn't start its own
	const prefix = getMockPluginPrefix()

	// Set NODE_ENV to production to ensure the manifest is loaded from the correct directory
	// The manifest is only built for 'development' and 'production' modes, not 'test'
	// Note: ROBO_MOCK_MODE=true forces lazy loading in portal-loader.ts to avoid Jest ESM issues
	process.env.NODE_ENV = 'production'
	process.env.ROBO_MOCK_MODE = 'true'
	process.env.ROBO_MOCK_PORT = String(port)
	process.env.ROBO_MOCK_SESSION_ID = sessionId
	process.env.DISCORD_TOKEN = session.token
	process.env.DISCORD_REST_API = `http://localhost:${port}${prefix}/api`
	process.env.__ROBO_MOCK_CONNECT_EXISTING = 'true'
	process.env.__ROBO_MOCK_SERVER_PORT = String(port)

	// Set verbose flag for robo.js to know whether to show console logs
	if (options.verbose) {
		process.env.ROBO_MOCK_VERBOSE = 'true'
	}

	// Determine if file logging should be enabled:
	// - Explicit logFile option takes priority
	// - Auto-enable when running under `robo mock test` with testFilePath provided
	const isTestMode = process.env.ROBO_MOCK_TEST_MODE === 'true'
	const shouldLogToFile = options.logFile !== false && (options.logFile || (isTestMode && !!options.testFilePath))

	// Set up file logging BEFORE Robo.start() to capture startup logs
	// We use addDrain() which persists across setup() calls (Robo.start() calls setup())
	// Note: Console output suppression is handled automatically by robo.js when
	// ROBO_MOCK_TEST_MODE=true and ROBO_MOCK_VERBOSE is not set
	let fileDrainHandle: DrainHandle | null = null

	if (shouldLogToFile && options.testFilePath) {
		const { createFileDrain, logger } = await import('robo.js')

		// Determine log file path
		let logPath: string
		if (typeof options.logFile === 'string') {
			logPath = options.logFile
		} else {
			// Auto-name: extract test file name, put in .robo/logs/tests/
			const testFileName = basename(options.testFilePath)
				.replace(/\.(test|spec)\.(ts|js|tsx|jsx|mts|mjs)$/, '.log')
			logPath = join('.robo', 'logs', 'tests', testFileName)
		}

		// Create file drain with blocking mode for immediate writes
		const fileDrain = createFileDrain({
			path: logPath,
			level: options.logLevel ?? 'debug',
			timestamp: 'iso',
			blocking: true, // Ensure logs are written before test ends
			stripAnsi: true
		})

		// Add file drain to the logger BEFORE Robo.start()
		// addDrain() adds to the _drains Map which persists across setup() calls
		const loggerInstance = logger()
		fileDrainHandle = loggerInstance.addDrain(fileDrain, `test-file-${sessionId}`)
	}

	// Set up session log drain to forward logs to the mock server
	// This enables the Logs Panel in Stage UI to show bot logs in real-time
	let sessionLogDrainHandle: DrainHandle | null = null
	const config = getMockConfig()

	// Create a drain that POSTs logs to the control API
	const { logger: getLogger } = await import('robo.js')

	 
	const ANSI_REGEX = /\x1b\[.*?m/g

	const sessionLogDrain = async (_loggerInstance: unknown, level: string, ...data: unknown[]): Promise<void> => {
		try {
			// Build message, stripping ANSI codes
			const message = data
				.map((item) => {
					if (item instanceof Error) {
						return `${item.message}${item.stack ? '\n' + item.stack : ''}`
					}
					if (typeof item === 'string') {
						return item.replace(ANSI_REGEX, '')
					}
					try {
						return JSON.stringify(item)
					} catch {
						return '[unserializable]'
					}
				})
				.join(' ')

			// Extract structured data
			const structuredData = data.filter((d) => typeof d === 'object' && d !== null)

			// Extract prefix from logger if available
			const loggerWithPrefix = _loggerInstance as { _prefix?: string } | undefined
			const prefix = loggerWithPrefix?._prefix

			// POST to control API (fire and forget - don't block logging)
			fetch(`${config.controlUrl}/sessions/${sessionId}/logs`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					timestamp: Date.now(),
					level,
					message,
					prefix,
					data: structuredData.length > 0 ? structuredData : undefined,
					source: {
						connectionId: `direct-${sessionId}`,
						sessionId,
						botUserId: session.botUser?.id,
						botUsername: session.botUser?.username
					}
				})
			}).catch(() => {
				// Ignore errors - don't block test execution
			})
		} catch {
			// Ignore errors during log processing
		}
	}

	// Add session log drain
	sessionLogDrainHandle = getLogger().addDrain(sessionLogDrain, `session-logs-${sessionId}`)

	// Import and start Robo directly
	const { Robo } = await import('robo.js')
	await Robo.start()

	// The Robo server port (where API routes are served) is separate from the mock server port
	const serverPort = parseInt(process.env.PORT ?? '3000')

	// Wait for readiness
	if (options.activity) {
		// Activity mode: wait for the HTTP server to be ready (no Gateway connection)
		await waitForServerReady(serverPort, timeout)
	} else {
		// Bot mode: wait for Gateway connection
		await waitForBotConnection(sessionId, timeout)
	}

	// Get the Discord.js client (dynamic import to avoid build-time dependency)
	let client: unknown = null
	try {
		// Use variable to avoid TypeScript checking the module
		const discordjsModule = '@robojs/discordjs'
		const discordjs = await import(/* webpackIgnore: true */ discordjsModule)
		client = discordjs.client
	} catch {
		// @robojs/discordjs not available, client will be null
	}

	return {
		sessionId,
		token: session.token,
		botUser: session.botUser,
		guilds: session.guilds,
		channels: session.channels,
		guildId: session.guildId,
		client,
		serverPort,
		stop: async () => {
			// IMPORTANT: Destroy client FIRST to stop log generation
			if (client && typeof (client as { destroy?: () => void }).destroy === 'function') {
				try {
					;(client as { destroy: () => void }).destroy()
				} catch {
					// Client may already be destroyed
				}
			}

			// Brief delay to let any in-flight events complete processing
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Clean up drains:
			// 1. Remove the session log drain
			// 2. Remove the file drain from secondary drains
			// 3. Restore console drain as primary drain (in case other code runs after tests)
			// NOTE: We skip flush() because consoleDrain uses stream.write() callbacks
			// which can hang if stdout has backpressure during shutdown.
			// Since file drain uses blocking: true (synchronous writes), all logs are already on disk.
			if (sessionLogDrainHandle) {
				sessionLogDrainHandle.remove()
			}
			if (fileDrainHandle) {
				fileDrainHandle.remove()
			}

			// Restore console drain for any subsequent logging
			const { consoleDrain, logger } = await import('robo.js')
			logger().setDrain(consoleDrain)

			// Save the recording to disk so it can be replayed later
			// We intentionally do NOT delete the session - sessions are kept alive so developers can:
			// - Connect to them after tests complete
			// - Inspect state in the Stage UI
			// - Use the replay feature
			// Sessions will be cleaned up when the mock server restarts.
			try {
				const config = getMockConfig()
				const response = await fetch(`${config.controlUrl}/sessions/${sessionId}/recording`, {
					method: 'POST'
				})
				if (response.ok) {
					// Update the registry with the recording path so replay button is enabled
					setTestFileRecordingPath(sessionId, `${sessionId}.json`)
				}
			} catch {
				// Recording save failed, but don't block the stop
			}
		}
	}
}

/**
 * Wait for the Robo HTTP server to be ready (for activity/server-only projects).
 * Polls the server port until it responds to HTTP requests.
 */
async function waitForServerReady(
	serverPort: number,
	timeout: number
): Promise<void> {
	const startTime = Date.now()

	while (Date.now() - startTime < timeout) {
		try {
			const response = await fetch(`http://localhost:${serverPort}/`)
			// Any response (even 404) means the server is up
			if (response.status > 0) {
				return
			}
		} catch {
			// Server not ready yet
		}

		await sleep(500)
	}

	throw new Error(`Server not ready on port ${serverPort} after ${timeout}ms`)
}

/**
 * Wait for the bot to connect to the gateway
 */
async function waitForBotConnection(
	sessionId: string,
	timeout: number
): Promise<void> {
	const startTime = Date.now()
	const config = getMockConfig()
	const url = `${config.controlUrl}/sessions/${sessionId}`

	while (Date.now() - startTime < timeout) {
		try {
			const response = await fetch(url)
			if (response.ok) {
				const data = (await response.json()) as { connections?: number }
				if (data.connections && data.connections > 0) {
					return
				}
			}
		} catch {
			// Server not ready yet
		}

		await sleep(500)
	}

	throw new Error(`Bot not connected after ${timeout}ms`)
}

/**
 * Wait for the bot to disconnect from the gateway (connections count reaches 0).
 */
async function waitForBotDisconnect(sessionId: string, timeout: number): Promise<void> {
	const startTime = Date.now()
	const config = getMockConfig()
	const url = `${config.controlUrl}/sessions/${sessionId}`

	while (Date.now() - startTime < timeout) {
		try {
			const response = await fetch(url)
			if (response.ok) {
				const data = (await response.json()) as { connections?: number }
				if (!data.connections || data.connections <= 0) {
					return
				}
			}
		} catch {
			// Server not ready yet
		}

		await sleep(200)
	}

	throw new Error(`Bot did not disconnect after ${timeout}ms`)
}
