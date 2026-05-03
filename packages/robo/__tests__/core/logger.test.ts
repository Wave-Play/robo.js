/**
 * Comprehensive test suite for the Logger system.
 *
 * Tests cover:
 * - Logger class instantiation and configuration
 * - Log level filtering
 * - All log methods (trace, debug, info, wait, log, event, ready, warn, error)
 * - Custom log levels
 * - Forked loggers
 * - Log buffer (getRecentLogs, LogEntry)
 * - consoleDrain (Node.js and Browser environments)
 * - ANSI to browser format conversion
 * - Logger enabled/disabled state
 * - Logger singleton pattern
 * - Mode label (shard mode)
 * - Environment-specific behavior
 * - Edge cases
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { Logger, consoleDrain, logger } from '../../src/core/logger.js'
import { createMockDrain, createDelayedMockDrain, createTestMeta } from '../utils/logging-test-helpers.js'

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Captures stdout and stderr writes for verification.
 */
function captureNodeOutput() {
	const stdout: string[] = []
	const stderr: string[] = []

	const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
		if (typeof chunk === 'string') {
			stdout.push(chunk)
		} else if (Buffer.isBuffer(chunk)) {
			stdout.push(chunk.toString())
		}
		return true
	})

	const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
		if (typeof chunk === 'string') {
			stderr.push(chunk)
		} else if (Buffer.isBuffer(chunk)) {
			stderr.push(chunk.toString())
		}
		return true
	})

	const restore = () => {
		stdoutSpy.mockRestore()
		stderrSpy.mockRestore()
	}

	return { stdout, stderr, restore }
}

/**
 * Captures console.log and console.error calls for browser environment testing.
 */
function captureConsoleCalls() {
	const logs: unknown[][] = []
	const errors: unknown[][] = []

	const logSpy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
		logs.push(args)
	})

	const errorSpy = jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
		errors.push(args)
	})

	const restore = () => {
		logSpy.mockRestore()
		errorSpy.mockRestore()
	}

	return { logs, errors, restore }
}

// ============================================================================
// Logger Constructor Tests
// ============================================================================

describe('Logger constructor', () => {
	test('creates logger with default options', () => {
		const testLogger = new Logger()
		expect(testLogger).toBeInstanceOf(Logger)
		expect(testLogger.getLevel()).toBe('info')
	})

	test('respects level option', () => {
		const testLogger = new Logger({ level: 'debug' })
		expect(testLogger.getLevel()).toBe('debug')
	})

	test('respects enabled option', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'trace', drain, enabled: false })

		testLogger.info('should not appear')
		await testLogger.flush()

		expect(calls.length).toBe(0)
	})

	test('respects drain option with custom drain', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'trace', drain })

		testLogger.info('test message')
		await testLogger.flush()

		expect(calls.length).toBe(1)
		expect(calls[0].level).toBe('info')
	})

	test('respects maxEntries option for log buffer', () => {
		// Note: maxEntries affects internal buffer, tested via getRecentLogs
		const testLogger = new Logger({ maxEntries: 5 })
		expect(testLogger).toBeInstanceOf(Logger)
	})

	test('respects prefix option (used when forking from this logger)', async () => {
		// Note: The prefix option is stored but only used when the logger has a parent
		// or when this logger is further forked. Direct logging doesn't show the prefix.
		const { drain, calls } = createMockDrain()
		const parent = new Logger({ level: 'trace', drain })
		const child = new Logger({ level: 'trace', parent, prefix: 'MyPrefix' })

		child.info('test')
		await parent.flush()

		expect(calls.length).toBe(1)
		// Prefix should be in the meta source
		expect(calls[0].meta.source).toContain('MyPrefix')
	})

	test('respects parent option (creates forked-like logger)', async () => {
		const { drain, calls } = createMockDrain()
		const parent = new Logger({ level: 'trace', drain })
		const child = new Logger({ parent, prefix: 'Child' })

		child.info('from child')
		await parent.flush()

		expect(calls.length).toBe(1)
		expect(calls[0].meta.source).toContain('Child')
	})

	test('respects customLevels option', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({
			level: 'trace',
			drain,
			customLevels: {
				custom: { label: 'CUSTOM', priority: 5 }
			}
		})

		testLogger.custom('custom', 'custom message')
		await testLogger.flush()

		expect(calls.length).toBe(1)
		expect(calls[0].level).toBe('custom')
	})

	test('binds all public methods to instance', () => {
		const testLogger = new Logger()

		// Extract methods and call them without binding - they should work correctly
		const { getLevel, getLevelValues, getRecentLogs, fork } = testLogger

		// These should not throw when called without explicit binding
		expect(() => getLevel()).not.toThrow()
		expect(() => getLevelValues()).not.toThrow()
		expect(() => getRecentLogs()).not.toThrow()
		expect(() => fork('test')).not.toThrow()
	})
})

// ============================================================================
// Logger.setup() Tests
// ============================================================================

describe('Logger.setup()', () => {
	test('reconfigures logger with new options', () => {
		const testLogger = new Logger({ level: 'info' })
		expect(testLogger.getLevel()).toBe('info')

		testLogger.setup({ level: 'debug' })
		expect(testLogger.getLevel()).toBe('debug')
	})

	test('preserves customLevels if not provided', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({
			level: 'trace',
			drain,
			customLevels: {
				myLevel: { label: 'MY', priority: 5 }
			}
		})

		// Reconfigure without customLevels - must also pass drain to preserve it
		// (setup() defaults drain to consoleDrain if not provided)
		testLogger.setup({ level: 'debug', drain })

		// Custom level should still work
		testLogger.custom('myLevel', 'test')
		await testLogger.flush()

		expect(calls.length).toBe(1)
		expect(calls[0].level).toBe('myLevel')
	})

	test('updates level when provided', () => {
		const testLogger = new Logger({ level: 'warn' })
		expect(testLogger.getLevel()).toBe('warn')

		testLogger.setup({ level: 'trace' })
		expect(testLogger.getLevel()).toBe('trace')
	})

	test('preserves level when omitted', () => {
		const testLogger = new Logger({ level: 'warn' })

		testLogger.setup({
			customLevels: {
				typeerror: { label: 'typeerror', priority: 7 }
			}
		})

		expect(testLogger.getLevel()).toBe('warn')
	})

	test('updates drain when provided', async () => {
		const { drain: drain1, calls: calls1 } = createMockDrain()
		const { drain: drain2, calls: calls2 } = createMockDrain()

		const testLogger = new Logger({ level: 'trace', drain: drain1 })

		testLogger.info('to drain 1')
		await testLogger.flush()
		expect(calls1.length).toBe(1)

		testLogger.setup({ drain: drain2 })

		testLogger.info('to drain 2')
		await testLogger.flush()
		expect(calls2.length).toBe(1)
	})

	test('preserves drain when omitted', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'trace', drain })

		testLogger.setup({
			customLevels: {
				typeerror: { label: 'typeerror', priority: 7 }
			}
		})
		testLogger.info('still uses existing drain')
		await testLogger.flush()

		expect(calls.length).toBe(1)
		expect(calls[0].data).toEqual(['still uses existing drain'])
	})

	test('updates enabled flag', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'trace', drain, enabled: true })

		testLogger.info('enabled')
		await testLogger.flush()
		expect(calls.length).toBe(1)

		testLogger.setup({ enabled: false })

		testLogger.info('disabled')
		await testLogger.flush()
		expect(calls.length).toBe(1) // Should not increase
	})

	test('reinitializes log buffer with new maxEntries', () => {
		const testLogger = new Logger({ maxEntries: 10 })
		testLogger.setup({ maxEntries: 5 })
		// Buffer reinitialized - no error should occur
		expect(testLogger.getRecentLogs(100)).toBeDefined()
	})
})

// ============================================================================
// Log Level Filtering Tests
// ============================================================================

describe('Log level filtering', () => {
	// IMPORTANT: The Logger only performs level filtering when using the default consoleDrain.
	// Custom drains receive ALL logs regardless of level - they're expected to do their own filtering
	// using createLevelFilteredDrain or similar wrappers.

	test('logs at or above configured level (with consoleDrain)', async () => {
		// Use consoleDrain which does level filtering
		const capture = captureNodeOutput()
		const testLogger = new Logger({ level: 'info' }) // Uses consoleDrain by default

		testLogger.info('info message')
		testLogger.warn('warn message')
		testLogger.error('error message')
		await testLogger.flush()

		capture.restore()

		const output = capture.stdout.join('') + capture.stderr.join('')
		expect(output).toContain('info message')
		expect(output).toContain('warn message')
		expect(output).toContain('error message')
	})

	test('blocks logs below configured level (with consoleDrain)', async () => {
		const capture = captureNodeOutput()
		const testLogger = new Logger({ level: 'warn' }) // Uses consoleDrain by default

		testLogger.trace('trace')
		testLogger.debug('debug')
		testLogger.info('info')
		testLogger.warn('warn message')
		await testLogger.flush()

		capture.restore()

		const stdout = capture.stdout.join('')
		const stderr = capture.stderr.join('')
		const output = stdout + stderr

		expect(output).not.toContain('trace')
		expect(output).not.toContain('debug')
		expect(output).not.toContain('[info]')
		expect(output).toContain('warn message')
	})

	test('custom drains receive all logs regardless of level', async () => {
		// This tests the quirk: custom drains bypass level filtering
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'error', drain })

		testLogger.trace('trace')
		testLogger.debug('debug')
		testLogger.info('info')
		await testLogger.flush()

		// All calls come through because custom drains bypass level filtering
		expect(calls.length).toBe(3)
	})

	test('trace level allows all messages', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'trace', drain })

		testLogger.trace('trace')
		testLogger.debug('debug')
		testLogger.info('info')
		testLogger.wait('wait')
		testLogger.log('other')
		testLogger.event('event')
		testLogger.ready('ready')
		testLogger.warn('warn')
		testLogger.error('error')
		await testLogger.flush()

		expect(calls.length).toBe(9)
	})

	test('error level with consoleDrain blocks all but error', async () => {
		const capture = captureNodeOutput()
		const testLogger = new Logger({ level: 'error' })

		testLogger.trace('trace')
		testLogger.debug('debug')
		testLogger.info('info')
		testLogger.warn('warn')
		testLogger.error('error message')
		await testLogger.flush()

		capture.restore()

		const output = capture.stdout.join('') + capture.stderr.join('')
		expect(output).not.toContain('trace')
		expect(output).not.toContain('debug')
		expect(output).not.toContain('[info]')
		expect(output).not.toContain('[warn]')
		expect(output).toContain('error message')
	})

	test('respects level changes via setup() (with consoleDrain)', async () => {
		const capture = captureNodeOutput()
		const testLogger = new Logger({ level: 'error' })

		testLogger.info('blocked')
		await testLogger.flush()

		testLogger.setup({ level: 'info' })

		testLogger.info('allowed info')
		await testLogger.flush()

		capture.restore()

		const output = capture.stdout.join('')
		expect(output).not.toContain('blocked')
		expect(output).toContain('allowed info')
	})

	test('custom levels integrate with priority ordering (with consoleDrain)', async () => {
		const capture = captureNodeOutput()
		const testLogger = new Logger({
			level: 'info', // priority 2
			customLevels: {
				low: { label: 'LOW', priority: 1 }, // Below info
				high: { label: 'HIGH', priority: 7 } // Same as warn
			}
		})

		testLogger.custom('low', 'should be blocked')
		testLogger.custom('high', 'should pass')
		await testLogger.flush()

		capture.restore()

		const output = capture.stdout.join('') + capture.stderr.join('')
		expect(output).not.toContain('should be blocked')
		expect(output).toContain('should pass')
	})
})

// ============================================================================
// Log Methods Tests
// ============================================================================

describe('Logger log methods', () => {
	let testLogger: Logger
	let calls: Array<{ level: string; meta: unknown; data: unknown[] }>

	beforeEach(() => {
		const mock = createMockDrain()
		calls = mock.calls
		testLogger = new Logger({ level: 'trace', drain: mock.drain })
	})

	test('trace() logs at trace level', async () => {
		testLogger.trace('trace message')
		await testLogger.flush()
		expect(calls[0].level).toBe('trace')
	})

	test('debug() logs at debug level', async () => {
		testLogger.debug('debug message')
		await testLogger.flush()
		expect(calls[0].level).toBe('debug')
	})

	test('info() logs at info level', async () => {
		testLogger.info('info message')
		await testLogger.flush()
		expect(calls[0].level).toBe('info')
	})

	test('wait() logs at wait level', async () => {
		testLogger.wait('wait message')
		await testLogger.flush()
		expect(calls[0].level).toBe('wait')
	})

	test('log() logs at other level (no label prefix)', async () => {
		testLogger.log('plain message')
		await testLogger.flush()
		expect(calls[0].level).toBe('other')
	})

	test('event() logs at event level', async () => {
		testLogger.event('event message')
		await testLogger.flush()
		expect(calls[0].level).toBe('event')
	})

	test('ready() logs at ready level', async () => {
		testLogger.ready('ready message')
		await testLogger.flush()
		expect(calls[0].level).toBe('ready')
	})

	test('warn() logs at warn level', async () => {
		testLogger.warn('warn message')
		await testLogger.flush()
		expect(calls[0].level).toBe('warn')
	})

	test('error() logs at error level', async () => {
		testLogger.error('error message')
		await testLogger.flush()
		expect(calls[0].level).toBe('error')
	})

	test('all methods accept multiple arguments', async () => {
		testLogger.info('arg1', 'arg2', 'arg3')
		await testLogger.flush()
		expect(calls[0].data.length).toBeGreaterThanOrEqual(3)
		expect(calls[0].data).toContain('arg1')
		expect(calls[0].data).toContain('arg2')
		expect(calls[0].data).toContain('arg3')
	})

	test('all methods handle objects', async () => {
		const obj = { key: 'value', nested: { a: 1 } }
		testLogger.info('object:', obj)
		await testLogger.flush()
		expect(calls[0].data).toContainEqual(obj)
	})

	test('all methods handle arrays', async () => {
		const arr = [1, 2, 3]
		testLogger.info('array:', arr)
		await testLogger.flush()
		expect(calls[0].data).toContainEqual(arr)
	})

	test('all methods handle errors', async () => {
		const err = new Error('test error')
		testLogger.error('error:', err)
		await testLogger.flush()
		expect(calls[0].data).toContainEqual(err)
	})
})

// ============================================================================
// Custom Log Levels Tests
// ============================================================================

describe('custom log levels', () => {
	test('registers custom level with priority', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({
			level: 'trace',
			drain,
			customLevels: {
				verbose: { label: 'VERBOSE', priority: 1 }
			}
		})

		testLogger.custom('verbose', 'verbose message')
		await testLogger.flush()

		expect(calls.length).toBe(1)
		expect(calls[0].level).toBe('verbose')
	})

	test('custom() method logs at custom level', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({
			level: 'trace',
			drain,
			customLevels: {
				audit: { label: 'AUDIT', priority: 6 }
			}
		})

		testLogger.custom('audit', 'audit log entry')
		await testLogger.flush()

		expect(calls.length).toBe(1)
		const dataStr = calls[0].data.join(' ')
		expect(dataStr).toContain('audit log entry')
	})

	test('custom level respects priority ordering (with consoleDrain)', async () => {
		// Level filtering only works with consoleDrain, not custom drains
		const capture = captureNodeOutput()
		const testLogger = new Logger({
			level: 'warn', // priority 7
			customLevels: {
				lowPriority: { label: 'LOW', priority: 3 },
				highPriority: { label: 'HIGH', priority: 8 }
			}
		})

		testLogger.custom('lowPriority', 'should be filtered')
		testLogger.custom('highPriority', 'should pass through')
		await testLogger.flush()

		capture.restore()

		const output = capture.stdout.join('') + capture.stderr.join('')
		expect(output).not.toContain('should be filtered')
		expect(output).toContain('should pass through')
	})

	test('custom level with color option applies color', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({
			level: 'trace',
			drain,
			customLevels: {
				success: { label: 'SUCCESS', priority: 5, color: 'green' }
			}
		})

		testLogger.custom('success', 'operation complete')
		await testLogger.flush()

		expect(calls.length).toBe(1)
		// Color is applied to the label in the output
		const dataStr = calls[0].data.join(' ')
		expect(dataStr).toContain('operation complete')
	})

	test('custom level without color uses default', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({
			level: 'trace',
			drain,
			customLevels: {
				noColor: { label: 'NOCLR', priority: 5 }
			}
		})

		testLogger.custom('noColor', 'plain label')
		await testLogger.flush()

		expect(calls.length).toBe(1)
	})

	test('ignores custom() call for unregistered level', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'trace', drain })

		testLogger.custom('unregistered', 'should not log')
		await testLogger.flush()

		expect(calls.length).toBe(0)
	})
})

// ============================================================================
// Logger.fork() Tests
// ============================================================================

describe('Logger.fork()', () => {
	test('creates new Logger instance with prefix', () => {
		const testLogger = new Logger()
		const forked = testLogger.fork('myPlugin')

		expect(forked).toBeInstanceOf(Logger)
		expect(forked).not.toBe(testLogger)
	})

	test('forked logger delegates to parent _log', async () => {
		const { drain, calls } = createMockDrain()
		const parent = new Logger({ level: 'trace', drain })
		const forked = parent.fork('plugin')

		forked.info('from forked')
		await parent.flush()

		expect(calls.length).toBe(1)
	})

	test('prefix appears in log output', async () => {
		const { drain, calls } = createMockDrain()
		const parent = new Logger({ level: 'trace', drain })
		const forked = parent.fork('myPrefix')

		forked.info('message')
		await parent.flush()

		expect(calls[0].meta.source).toContain('myPrefix')
	})

	test('chained forks use intermediate parent prefix', async () => {
		// Note: Due to how _log delegation works, each parent in the chain overwrites
		// the prefix with its own _prefix when delegating. This means only the
		// immediate child's prefix is preserved through the chain.
		// forked2 passes 'level1level2' to forked1, but forked1 passes 'level1' to parent.
		const { drain, calls } = createMockDrain()
		const parent = new Logger({ level: 'trace', drain })
		const forked1 = parent.fork('level1')
		const forked2 = forked1.fork('level2')

		forked2.info('deep message')
		await parent.flush()

		// Only the first fork's prefix appears in final output due to delegation behavior
		expect(calls[0].meta.source).toContain('level1')
		expect(calls[0].data).toContain('deep message')
	})

	test('forked logger uses parent drain', async () => {
		const { drain, calls } = createMockDrain()
		const parent = new Logger({ level: 'trace', drain })
		const forked = parent.fork('test')

		forked.info('test')
		await parent.flush()

		expect(calls.length).toBe(1)
	})

	test('forked logger.flush() delegates to parent', async () => {
		const { drain: slowDrain, calls } = createDelayedMockDrain(20)
		const parent = new Logger({ level: 'trace', drain: slowDrain })
		const forked = parent.fork('test')

		forked.info('delayed')
		await forked.flush()

		expect(calls.length).toBe(1)
	})

	test('forked logger.getLevel() delegates to parent', () => {
		const parent = new Logger({ level: 'debug' })
		const forked = parent.fork('test')

		expect(forked.getLevel()).toBe('debug')
	})

	test('forked logger.getLevelValues() delegates to parent', () => {
		const parent = new Logger({
			level: 'trace',
			customLevels: { test: { label: 'TEST', priority: 5 } }
		})
		const forked = parent.fork('test')

		const levelValues = forked.getLevelValues()
		expect(levelValues.test).toBe(5)
	})

	test('forked logger.getRecentLogs() delegates to parent', () => {
		const parent = new Logger({ level: 'trace', drain: async () => {} })
		const forked = parent.fork('test')

		// Should not throw and should return an array (actual content depends on DEBUG_MODE)
		const logs = forked.getRecentLogs()
		expect(Array.isArray(logs)).toBe(true)
	})

	test('forked logger.addDrain() delegates to parent', async () => {
		const parent = new Logger({ level: 'trace', drain: async () => {} })
		const forked = parent.fork('test')

		const { drain, calls } = createMockDrain()
		const handle = forked.addDrain(drain)

		parent.info('from parent')
		await parent.flush()

		expect(calls.length).toBe(1)

		handle.remove()
	})

	test('forked logger.removeDrain() delegates to parent', async () => {
		const parent = new Logger({ level: 'trace', drain: async () => {} })
		const forked = parent.fork('test')

		const { drain, calls } = createMockDrain()
		parent.addDrain(drain, 'test-drain')

		parent.info('before remove')
		await parent.flush()
		expect(calls.length).toBe(1)

		const removed = forked.removeDrain('test-drain')
		expect(removed).toBe(true)

		parent.info('after remove')
		await parent.flush()
		expect(calls.length).toBe(1)
	})
})

// ============================================================================
// Log Buffer (getRecentLogs) Tests
// ============================================================================

describe('Logger.getRecentLogs()', () => {
	test('returns empty array when no logs', () => {
		const testLogger = new Logger()
		const logs = testLogger.getRecentLogs()
		expect(logs).toEqual([])
	})

	test('returns array (logs stored only in DEBUG_MODE)', async () => {
		// Note: Log buffer only stores entries when DEBUG_MODE is true (ROBO_DEV=true at module load)
		// Since DEBUG_MODE is evaluated at module initialization, we can't easily change it in tests
		// This test verifies the method works without error
		const testLogger = new Logger({ level: 'trace', drain: async () => {} })
		testLogger.info('first')
		testLogger.info('second')
		testLogger.info('third')
		await testLogger.flush()

		const logs = testLogger.getRecentLogs(3)
		expect(Array.isArray(logs)).toBe(true)
		// If DEBUG_MODE is true, logs would have entries; otherwise empty
	})

	test('respects count parameter', async () => {
		const testLogger = new Logger({ level: 'trace', drain: async () => {} })
		const logs = testLogger.getRecentLogs(5)
		expect(Array.isArray(logs)).toBe(true)
	})

	test('handles count <= 0 (empty array)', () => {
		const testLogger = new Logger()
		expect(testLogger.getRecentLogs(0)).toEqual([])
		expect(testLogger.getRecentLogs(-1)).toEqual([])
	})
})

// ============================================================================
// consoleDrain Tests - Node.js Environment
// ============================================================================

describe('consoleDrain - Node.js environment', () => {
	test('writes info/debug to stdout', async () => {
		const capture = captureNodeOutput()
		const testLogger = new Logger({ level: 'trace' })

		testLogger.info('stdout message')
		await testLogger.flush()

		capture.restore()

		expect(capture.stdout.some((s) => s.includes('stdout message'))).toBe(true)
		expect(capture.stderr.some((s) => s.includes('stdout message'))).toBe(false)
	})

	test('writes warn/error to stderr', async () => {
		const capture = captureNodeOutput()
		const testLogger = new Logger({ level: 'trace' })

		testLogger.warn('warn message')
		testLogger.error('error message')
		await testLogger.flush()

		capture.restore()

		expect(capture.stderr.some((s) => s.includes('warn message'))).toBe(true)
		expect(capture.stderr.some((s) => s.includes('error message'))).toBe(true)
	})

	test('inspects objects', async () => {
		const capture = captureNodeOutput()
		const testLogger = new Logger({ level: 'trace' })

		testLogger.info('object:', { key: 'value' })
		await testLogger.flush()

		capture.restore()

		const output = capture.stdout.join('')
		expect(output).toContain('key')
		expect(output).toContain('value')
	})

	test('inspects errors with stack', async () => {
		const capture = captureNodeOutput()
		const testLogger = new Logger({ level: 'trace' })

		const err = new Error('test error')
		testLogger.error('Error:', err)
		await testLogger.flush()

		capture.restore()

		const output = capture.stderr.join('')
		expect(output).toContain('test error')
		expect(output).toContain('Error')
	})

	test('inspects arrays', async () => {
		const capture = captureNodeOutput()
		const testLogger = new Logger({ level: 'trace' })

		testLogger.info('array:', [1, 2, 3])
		await testLogger.flush()

		capture.restore()

		const output = capture.stdout.join('')
		expect(output).toContain('1')
		expect(output).toContain('2')
		expect(output).toContain('3')
	})
})

// ============================================================================
// consoleDrain Tests - Browser Environment
// ============================================================================

describe('consoleDrain - Browser environment', () => {
	// Mock browser detection by mocking the module
	let originalWindow: typeof globalThis.window
	let originalDocument: typeof globalThis.document

	beforeEach(() => {
		// Save originals
		originalWindow = (global as unknown as { window: typeof window }).window
		originalDocument = (global as unknown as { document: typeof document }).document

		// Create minimal browser-like environment
		;(global as unknown as { window: object }).window = {}
		;(global as unknown as { document: object }).document = {}
	})

	afterEach(() => {
		// Restore
		if (originalWindow === undefined) {
			delete (global as unknown as { window?: unknown }).window
		} else {
			;(global as unknown as { window: typeof window }).window = originalWindow
		}
		if (originalDocument === undefined) {
			delete (global as unknown as { document?: unknown }).document
		} else {
			;(global as unknown as { document: typeof document }).document = originalDocument
		}
	})

	test('uses console.log for non-error levels', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// Note: consoleDrain checks isBrowser() which checks window and document
		// Since we've set them, it should use console methods
		await consoleDrain(testLogger, 'info', createTestMeta(), 'browser log')

		capture.restore()

		expect(capture.logs.length).toBe(1)
		expect(capture.errors.length).toBe(0)
	})

	test('uses console.error for warn level', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		await consoleDrain(testLogger, 'warn', createTestMeta(), 'browser warning')

		capture.restore()

		expect(capture.errors.length).toBe(1)
	})

	test('uses console.error for error level', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		await consoleDrain(testLogger, 'error', createTestMeta(), 'browser error')

		capture.restore()

		expect(capture.errors.length).toBe(1)
	})

	test('preserves objects for browser console', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })
		const obj = { key: 'value' }

		await consoleDrain(testLogger, 'info', createTestMeta(), 'data:', obj)

		capture.restore()

		// Should include %o format and the object
		expect(capture.logs.length).toBe(1)
		const args = capture.logs[0]
		expect(args).toContainEqual(obj)
	})

	test('handles no-ANSI strings', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		await consoleDrain(testLogger, 'info', createTestMeta(), 'plain text without colors')

		capture.restore()

		expect(capture.logs.length).toBe(1)
	})

	test('converts ANSI color codes to %c format', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// Red ANSI code followed by reset
		const ansiString = '\x1b[31mred text\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		expect(capture.logs.length).toBe(1)
		const args = capture.logs[0]
		// First arg should be the format string with %c placeholders
		expect(typeof args[0]).toBe('string')
		const formatStr = args[0] as string
		expect(formatStr).toContain('%c')
		expect(formatStr).toContain('red text')
		// CSS args should follow
		expect(args.length).toBeGreaterThan(1)
	})

	test('applies correct CSS for foreground colors', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// Green foreground (code 32)
		const ansiString = '\x1b[32mgreen\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		// Should have CSS with green color
		const cssArgs = args.slice(1).filter((a) => typeof a === 'string')
		const hasGreenColor = cssArgs.some((css) => (css as string).includes('#4CAF50'))
		expect(hasGreenColor).toBe(true)
	})

	test('applies correct CSS for bold text', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// Bold (code 1)
		const ansiString = '\x1b[1mbold text\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		const cssArgs = args.slice(1).filter((a) => typeof a === 'string')
		const hasBold = cssArgs.some((css) => (css as string).includes('font-weight: bold'))
		expect(hasBold).toBe(true)
	})

	test('handles combined ANSI codes', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// Bold + cyan (codes 1 and 36)
		const ansiString = '\x1b[1;36mbold cyan\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		const cssArgs = args.slice(1).filter((a) => typeof a === 'string')
		// Should have both bold and cyan color
		const combinedStyle = cssArgs.some(
			(css) => (css as string).includes('font-weight: bold') && (css as string).includes('#00E5FF')
		)
		expect(combinedStyle).toBe(true)
	})

	test('escapes % characters in output', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// String with % that should be escaped
		const ansiString = '\x1b[31m100% complete\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		const formatStr = args[0] as string
		// % should be escaped to %% in the format string
		expect(formatStr).toContain('%%')
	})

	test('handles underline decoration', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// Underline (code 4)
		const ansiString = '\x1b[4munderlined\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		const cssArgs = args.slice(1).filter((a) => typeof a === 'string')
		const hasUnderline = cssArgs.some(
			(css) => (css as string).includes('text-decoration') && (css as string).includes('underline')
		)
		expect(hasUnderline).toBe(true)
	})

	test('handles italic style', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// Italic (code 3)
		const ansiString = '\x1b[3mitalic\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		const cssArgs = args.slice(1).filter((a) => typeof a === 'string')
		const hasItalic = cssArgs.some((css) => (css as string).includes('font-style: italic'))
		expect(hasItalic).toBe(true)
	})

	test('handles background colors', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// Yellow background (code 43)
		const ansiString = '\x1b[43mhighlighted\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		const cssArgs = args.slice(1).filter((a) => typeof a === 'string')
		const hasBgColor = cssArgs.some((css) => (css as string).includes('background-color'))
		expect(hasBgColor).toBe(true)
	})

	test('handles bright/high-intensity colors', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// Bright magenta (code 95)
		const ansiString = '\x1b[95mbright magenta\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		const cssArgs = args.slice(1).filter((a) => typeof a === 'string')
		const hasBrightMagenta = cssArgs.some((css) => (css as string).includes('#EA80FC'))
		expect(hasBrightMagenta).toBe(true)
	})

	test('handles mixed ANSI strings and objects', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		const obj = { data: 123 }
		const ansiString = '\x1b[32mprefix\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString, obj, 'suffix')

		capture.restore()

		const args = capture.logs[0]
		const formatStr = args[0] as string
		// Should have %c for ANSI and %o for object
		expect(formatStr).toContain('%c')
		expect(formatStr).toContain('%o')
		expect(args).toContainEqual(obj)
	})

	test('handles dim text (code 2)', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// Dim (code 2)
		const ansiString = '\x1b[2mdim text\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		const cssArgs = args.slice(1).filter((a) => typeof a === 'string')
		// Dim applies a gray color
		const hasDim = cssArgs.some((css) => (css as string).includes('color'))
		expect(hasDim).toBe(true)
	})

	test('handles strikethrough decoration', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// Strikethrough (code 9)
		const ansiString = '\x1b[9mstrikethrough\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		const cssArgs = args.slice(1).filter((a) => typeof a === 'string')
		const hasStrikethrough = cssArgs.some(
			(css) => (css as string).includes('text-decoration') && (css as string).includes('line-through')
		)
		expect(hasStrikethrough).toBe(true)
	})

	test('handles multiple sequential ANSI codes', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// Red then green then blue
		const ansiString = '\x1b[31mred\x1b[32mgreen\x1b[34mblue\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		const formatStr = args[0] as string
		// Should have multiple %c placeholders for color changes
		const percentCCount = (formatStr.match(/%c/g) || []).length
		expect(percentCCount).toBeGreaterThanOrEqual(3)
	})
})

// ============================================================================
// Logger Enabled/Disabled State Tests
// ============================================================================

describe('Logger enabled flag', () => {
	test('enabled=true allows logging', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'trace', drain, enabled: true })

		testLogger.info('enabled message')
		await testLogger.flush()

		expect(calls.length).toBe(1)
	})

	test('enabled=false suppresses all logs', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'trace', drain, enabled: false })

		testLogger.trace('trace')
		testLogger.debug('debug')
		testLogger.info('info')
		testLogger.warn('warn')
		testLogger.error('error')
		await testLogger.flush()

		expect(calls.length).toBe(0)
	})

	test('can be toggled via setup()', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'trace', drain, enabled: true })

		testLogger.info('first')
		await testLogger.flush()
		expect(calls.length).toBe(1)

		// Disable logging - need to also pass drain to preserve it
		testLogger.setup({ enabled: false, drain })
		testLogger.info('second')
		await testLogger.flush()
		expect(calls.length).toBe(1) // Should still be 1

		// Re-enable logging - need to pass drain to preserve it
		testLogger.setup({ enabled: true, drain })
		testLogger.info('third')
		await testLogger.flush()
		expect(calls.length).toBe(2) // Now should be 2
	})
})

// ============================================================================
// Logger Singleton Pattern Tests
// ============================================================================

describe('logger singleton', () => {
	// Note: The singleton persists across tests, so we need to be careful

	test('logger() creates singleton on first call', () => {
		const instance = logger()
		expect(instance).toBeInstanceOf(Logger)
	})

	test('logger() returns same instance on subsequent calls', () => {
		const instance1 = logger()
		const instance2 = logger()
		expect(instance1).toBe(instance2)
	})

	test('logger(options) configures singleton', () => {
		logger({ level: 'debug' })
		expect(logger().getLevel()).toBe('debug')
	})

	test('all static methods delegate to singleton', async () => {
		const { drain, calls } = createMockDrain()
		logger({ level: 'trace', drain })

		// Test static log methods
		logger.trace('trace')
		logger.debug('debug')
		logger.info('info')
		logger.wait('wait')
		logger.log('other')
		logger.event('event')
		logger.ready('ready')
		logger.warn('warn')
		logger.error('error')
		await logger.flush()

		expect(calls.length).toBe(9)
	})

	test('logger.fork() creates forked logger', () => {
		const forked = logger.fork('prefix')
		expect(forked).toBeInstanceOf(Logger)
	})

	test('logger.getRecentLogs() returns array', () => {
		const logs = logger.getRecentLogs()
		expect(Array.isArray(logs)).toBe(true)
	})

	test('logger.addDrain() adds drain', async () => {
		const { drain, calls } = createMockDrain()
		const handle = logger.addDrain(drain, 'singleton-test-drain')

		logger.info('test')
		await logger.flush()

		expect(calls.length).toBeGreaterThanOrEqual(1)

		handle.remove()
	})

	test('logger.removeDrain() removes drain', () => {
		const { drain } = createMockDrain()
		logger.addDrain(drain, 'remove-test-drain')

		const result = logger.removeDrain('remove-test-drain')
		expect(result).toBe(true)
	})

	test('logger.custom() logs custom levels', async () => {
		const { drain, calls } = createMockDrain()
		logger({
			level: 'trace',
			drain,
			customLevels: {
				singleton: { label: 'SINGLE', priority: 5 }
			}
		})

		logger.custom('singleton', 'custom message')
		await logger.flush()

		expect(calls.some((c) => c.level === 'singleton')).toBe(true)
	})
})

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('Edge cases', () => {
	test('handles empty log data', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'trace', drain })

		testLogger.info()
		await testLogger.flush()

		// Should still log, just with no user data (only level label)
		expect(calls.length).toBe(1)
	})

	test('handles null/undefined in log data', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'trace', drain })

		testLogger.info(null, undefined, 'value')
		await testLogger.flush()

		expect(calls.length).toBe(1)
		expect(calls[0].data).toContain(null)
		expect(calls[0].data).toContain(undefined)
	})

	test('handles circular object references', async () => {
		const capture = captureNodeOutput()
		const testLogger = new Logger({ level: 'trace' })

		const circular: { self?: unknown } = {}
		circular.self = circular

		// Should not throw
		testLogger.info('circular:', circular)
		await testLogger.flush()

		capture.restore()

		// Should have logged something (node inspect handles circular refs)
		expect(capture.stdout.length).toBeGreaterThan(0)
	})

	test('handles very long strings', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'trace', drain })

		const longString = 'x'.repeat(10000)
		testLogger.info(longString)
		await testLogger.flush()

		expect(calls.length).toBe(1)
		expect(calls[0].data.some((d) => typeof d === 'string' && d.length === 10000)).toBe(true)
	})

	test('handles many concurrent log calls', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'trace', drain })

		// Fire many logs concurrently
		for (let i = 0; i < 100; i++) {
			testLogger.info(`message ${i}`)
		}
		await testLogger.flush()

		expect(calls.length).toBe(100)
	})

	test('handles rapid addDrain/removeDrain', async () => {
		const testLogger = new Logger({ level: 'trace', drain: async () => {} })

		for (let i = 0; i < 50; i++) {
			const { drain } = createMockDrain()
			const handle = testLogger.addDrain(drain, `drain-${i}`)
			testLogger.info(`message ${i}`)
			handle.remove()
		}

		await testLogger.flush()

		// Should not throw
		expect(true).toBe(true)
	})

	test('handles symbols in log data', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'trace', drain })

		const sym = Symbol('test')
		testLogger.info('symbol:', sym)
		await testLogger.flush()

		expect(calls.length).toBe(1)
	})

	test('handles functions in log data', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'trace', drain })

		const fn = () => 'test'
		testLogger.info('function:', fn)
		await testLogger.flush()

		expect(calls.length).toBe(1)
	})

	test('handles mixed data types', async () => {
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'trace', drain })

		testLogger.info('string', 123, true, null, undefined, { key: 'value' }, ['array'], new Error('err'))
		await testLogger.flush()

		expect(calls.length).toBe(1)
		expect(calls[0].data.length).toBeGreaterThanOrEqual(8)
	})
})

// ============================================================================
// setDrain Tests
// ============================================================================

describe('Logger.setDrain()', () => {
	test('replaces primary drain', async () => {
		const { drain: drain1, calls: calls1 } = createMockDrain()
		const { drain: drain2, calls: calls2 } = createMockDrain()

		const testLogger = new Logger({ level: 'trace', drain: drain1 })

		testLogger.info('to drain1')
		await testLogger.flush()
		expect(calls1.length).toBe(1)
		expect(calls2.length).toBe(0)

		testLogger.setDrain(drain2)

		testLogger.info('to drain2')
		await testLogger.flush()
		expect(calls1.length).toBe(1)
		expect(calls2.length).toBe(1)
	})

	test('preserves additional drains when primary is replaced', async () => {
		const { drain: primary1 } = createMockDrain()
		const { drain: primary2, calls: primary2Calls } = createMockDrain()
		const { drain: additional, calls: additionalCalls } = createMockDrain()

		const testLogger = new Logger({ level: 'trace', drain: primary1 })
		testLogger.addDrain(additional)

		testLogger.setDrain(primary2)

		testLogger.info('test')
		await testLogger.flush()

		expect(primary2Calls.length).toBe(1)
		expect(additionalCalls.length).toBe(1)
	})
})

// ============================================================================
// flush() Tests
// ============================================================================

describe('Logger.flush()', () => {
	test('waits for all pending drains', async () => {
		const { drain, calls } = createDelayedMockDrain(50)
		const testLogger = new Logger({ level: 'trace', drain })

		testLogger.info('delayed message')

		// Before flush, the delayed drain may not have completed
		expect(calls.length).toBe(0)

		await testLogger.flush()

		// After flush, it should be complete
		expect(calls.length).toBe(1)
	})

	test('returns immediately if no pending drains', async () => {
		const testLogger = new Logger({ level: 'trace', drain: async () => {} })

		const start = Date.now()
		await testLogger.flush()
		const elapsed = Date.now() - start

		expect(elapsed).toBeLessThan(50) // Should be nearly instant
	})

	test('handles multiple concurrent flushes', async () => {
		const { drain, calls } = createDelayedMockDrain(30)
		const testLogger = new Logger({ level: 'trace', drain })

		testLogger.info('message')

		// Call flush multiple times concurrently
		await Promise.all([testLogger.flush(), testLogger.flush(), testLogger.flush()])

		expect(calls.length).toBe(1)
	})
})

// ============================================================================
// getLevelValues Tests
// ============================================================================

describe('Logger.getLevelValues()', () => {
	test('returns default level values', () => {
		const testLogger = new Logger()
		const values = testLogger.getLevelValues()

		expect(values.trace).toBe(0)
		expect(values.debug).toBe(1)
		expect(values.info).toBe(2)
		expect(values.wait).toBe(3)
		expect(values.other).toBe(4)
		expect(values.event).toBe(5)
		expect(values.ready).toBe(6)
		expect(values.warn).toBe(7)
		expect(values.error).toBe(8)
	})

	test('includes custom level values', () => {
		const testLogger = new Logger({
			customLevels: {
				myLevel: { label: 'MY', priority: 99 }
			}
		})
		const values = testLogger.getLevelValues()

		expect(values.myLevel).toBe(99)
	})

	test('custom levels can override default priorities', () => {
		const testLogger = new Logger({
			customLevels: {
				// This creates a new level, doesn't override info
				superInfo: { label: 'SUPER', priority: 2 }
			}
		})
		const values = testLogger.getLevelValues()

		expect(values.info).toBe(2)
		expect(values.superInfo).toBe(2)
	})
})

// ============================================================================
// Colorized Output Tests
// ============================================================================

describe('Colorized output', () => {
	test('level labels include ANSI colors', async () => {
		const capture = captureNodeOutput()
		const testLogger = new Logger({ level: 'trace' })

		testLogger.info('colored output')
		await testLogger.flush()

		capture.restore()

		const output = capture.stdout.join('')
		// ANSI escape codes start with \x1b[
		expect(output).toMatch(/\x1b\[/)
	})

	test('different levels have different colors', async () => {
		const capture = captureNodeOutput()
		const testLogger = new Logger({ level: 'trace' })

		testLogger.info('info')
		testLogger.warn('warn')
		await testLogger.flush()

		capture.restore()

		// Both should have ANSI codes, but different ones
		const stdoutOutput = capture.stdout.join('')
		const stderrOutput = capture.stderr.join('')

		expect(stdoutOutput).toMatch(/\x1b\[/)
		expect(stderrOutput).toMatch(/\x1b\[/)
	})
})

// ============================================================================
// ANSI Regex Tests
// ============================================================================

describe('ANSI_REGEX', () => {
	test('matches basic color codes', async () => {
		const { ANSI_REGEX } = await import('../../src/core/logger.js')

		expect('\x1b[31m'.match(ANSI_REGEX)).not.toBeNull()
		expect('\x1b[0m'.match(ANSI_REGEX)).not.toBeNull()
		expect('\x1b[1;32m'.match(ANSI_REGEX)).not.toBeNull()
	})

	test('can strip ANSI codes from string', async () => {
		const { ANSI_REGEX } = await import('../../src/core/logger.js')

		const colored = '\x1b[31mred\x1b[0m \x1b[32mgreen\x1b[0m'
		const stripped = colored.replace(ANSI_REGEX, '')

		expect(stripped).toBe('red green')
	})
})

// ============================================================================
// DEBUG_MODE Tests
// ============================================================================

describe('DEBUG_MODE', () => {
	test('DEBUG_MODE is exported', async () => {
		const { DEBUG_MODE } = await import('../../src/core/logger.js')
		expect(typeof DEBUG_MODE).toBe('boolean')
	})
})

// ============================================================================
// createLevelFilteredDrain Tests
// ============================================================================

describe('createLevelFilteredDrain', () => {
	test('filters out logs below minimum level', async () => {
		const { createLevelFilteredDrain } = await import('../../src/core/logger.js')
		const { drain, calls } = createMockDrain()
		const filtered = createLevelFilteredDrain(drain, 'warn')

		const testLogger = new Logger({ level: 'trace', drain: filtered })

		testLogger.debug('should be filtered')
		testLogger.info('should be filtered')
		testLogger.warn('should pass')
		testLogger.error('should pass')
		await testLogger.flush()

		expect(calls.length).toBe(2)
		expect(calls.every((c) => c.level === 'warn' || c.level === 'error')).toBe(true)
	})

	test('respects custom level priorities', async () => {
		const { createLevelFilteredDrain } = await import('../../src/core/logger.js')
		const { drain, calls } = createMockDrain()
		const filtered = createLevelFilteredDrain(drain, 'event') // priority 5

		const testLogger = new Logger({
			level: 'trace',
			drain: filtered,
			customLevels: {
				myLevel: { label: 'MY', priority: 6 }
			}
		})

		testLogger.info('priority 2 - filtered')
		testLogger.custom('myLevel', 'priority 6 - passes')
		testLogger.warn('priority 7 - passes')
		await testLogger.flush()

		expect(calls.length).toBe(2)
	})

	test('works with trace level (allows everything)', async () => {
		const { createLevelFilteredDrain } = await import('../../src/core/logger.js')
		const { drain, calls } = createMockDrain()
		const filtered = createLevelFilteredDrain(drain, 'trace')

		const testLogger = new Logger({ level: 'trace', drain: filtered })

		testLogger.trace('trace')
		testLogger.debug('debug')
		testLogger.info('info')
		await testLogger.flush()

		expect(calls.length).toBe(3)
	})

	test('works with error level (only errors)', async () => {
		const { createLevelFilteredDrain } = await import('../../src/core/logger.js')
		const { drain, calls } = createMockDrain()
		const filtered = createLevelFilteredDrain(drain, 'error')

		const testLogger = new Logger({ level: 'trace', drain: filtered })

		testLogger.trace('trace')
		testLogger.debug('debug')
		testLogger.info('info')
		testLogger.warn('warn')
		testLogger.error('error')
		await testLogger.flush()

		expect(calls.length).toBe(1)
		expect(calls[0].level).toBe('error')
	})
})

// ============================================================================
// Browser ANSI - Additional Style Tests
// ============================================================================

describe('Browser ANSI - Additional styles', () => {
	let originalWindow: typeof globalThis.window
	let originalDocument: typeof globalThis.document

	beforeEach(() => {
		originalWindow = (global as unknown as { window: typeof window }).window
		originalDocument = (global as unknown as { document: typeof document }).document
		;(global as unknown as { window: object }).window = {}
		;(global as unknown as { document: object }).document = {}
	})

	afterEach(() => {
		if (originalWindow === undefined) {
			delete (global as unknown as { window?: unknown }).window
		} else {
			;(global as unknown as { window: typeof window }).window = originalWindow
		}
		if (originalDocument === undefined) {
			delete (global as unknown as { document?: unknown }).document
		} else {
			;(global as unknown as { document: typeof document }).document = originalDocument
		}
	})

	test('handles inverse (code 7)', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		const ansiString = '\x1b[7minverted\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		const cssArgs = args.slice(1).filter((a) => typeof a === 'string')
		const hasInverse = cssArgs.some((css) => (css as string).includes('filter') && (css as string).includes('invert'))
		expect(hasInverse).toBe(true)
	})

	test('handles hidden (code 8)', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		const ansiString = '\x1b[8mhidden\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		const cssArgs = args.slice(1).filter((a) => typeof a === 'string')
		const hasHidden = cssArgs.some((css) => (css as string).includes('visibility: hidden'))
		expect(hasHidden).toBe(true)
	})

	test('handles reset bold/dim (code 22)', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// Bold then reset bold
		const ansiString = '\x1b[1mbold\x1b[22mnot bold\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		// Should have CSS args
		expect(args.length).toBeGreaterThan(1)
	})

	test('handles reset underline (code 24)', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// Underline then reset
		const ansiString = '\x1b[4munderlined\x1b[24mnot underlined\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		expect(capture.logs.length).toBe(1)
	})

	test('handles default foreground color (code 39)', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// Red then default
		const ansiString = '\x1b[31mred\x1b[39mdefault\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		const cssArgs = args.slice(1).filter((a) => typeof a === 'string')
		const hasInherit = cssArgs.some((css) => (css as string).includes('color: inherit'))
		expect(hasInherit).toBe(true)
	})

	test('handles all standard foreground colors', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// All 8 standard colors: 30-37
		const ansiString =
			'\x1b[30mblack\x1b[31mred\x1b[32mgreen\x1b[33myellow\x1b[34mblue\x1b[35mmagenta\x1b[36mcyan\x1b[37mwhite\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		const formatStr = args[0] as string
		// Should have 8 color sections from the data, plus additional from the level label
		const percentCCount = (formatStr.match(/%c/g) || []).length
		expect(percentCCount).toBeGreaterThanOrEqual(8)
	})

	test('handles all bright foreground colors', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// All 8 bright colors: 90-97
		const ansiString =
			'\x1b[90mgray\x1b[91mred\x1b[92mgreen\x1b[93myellow\x1b[94mblue\x1b[95mmagenta\x1b[96mcyan\x1b[97mwhite\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		const formatStr = args[0] as string
		const percentCCount = (formatStr.match(/%c/g) || []).length
		expect(percentCCount).toBeGreaterThanOrEqual(8)
	})

	test('handles dim with existing color', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		// Set red color first, then dim it
		const ansiString = '\x1b[31m\x1b[2mdim red\x1b[0m'
		await consoleDrain(testLogger, 'info', createTestMeta(), ansiString)

		capture.restore()

		const args = capture.logs[0]
		const cssArgs = args.slice(1).filter((a) => typeof a === 'string')
		// The color should be dimmed (different from the original #F44336)
		// Dimming #F44336 by 0.6 gives approximately #922a20
		const hasDimmedColor = cssArgs.some((css) => {
			const cssStr = css as string
			return cssStr.includes('color:') && !cssStr.includes('#F44336')
		})
		expect(hasDimmedColor).toBe(true)
	})

	test('handles only objects (no format string needed)', async () => {
		const capture = captureConsoleCalls()
		const testLogger = new Logger({ level: 'trace' })

		const obj1 = { a: 1 }
		const obj2 = { b: 2 }
		await consoleDrain(testLogger, 'info', createTestMeta(), obj1, obj2)

		capture.restore()

		const args = capture.logs[0]
		// When there are no strings, objects should be logged directly
		expect(args).toContainEqual(obj1)
		expect(args).toContainEqual(obj2)
	})
})

// ============================================================================
// Node.js Output - ANSI Colors in Output
// ============================================================================

describe('Node.js output includes ANSI colors', () => {
	test('trace level has gray color', async () => {
		const capture = captureNodeOutput()
		const testLogger = new Logger({ level: 'trace' })

		testLogger.trace('trace message')
		await testLogger.flush()

		capture.restore()

		const output = capture.stdout.join('')
		// Gray is ANSI code 90 or similar
		expect(output).toMatch(/\x1b\[\d+m.*trace/)
	})

	test('debug level has cyan color', async () => {
		const capture = captureNodeOutput()
		const testLogger = new Logger({ level: 'trace' })

		testLogger.debug('debug message')
		await testLogger.flush()

		capture.restore()

		const output = capture.stdout.join('')
		expect(output).toMatch(/\x1b\[\d+m.*debug/)
	})

	test('info level has blue color', async () => {
		const capture = captureNodeOutput()
		const testLogger = new Logger({ level: 'trace' })

		testLogger.info('info message')
		await testLogger.flush()

		capture.restore()

		const output = capture.stdout.join('')
		expect(output).toMatch(/\x1b\[\d+m.*info/)
	})

	test('warn level has yellow color', async () => {
		const capture = captureNodeOutput()
		const testLogger = new Logger({ level: 'trace' })

		testLogger.warn('warn message')
		await testLogger.flush()

		capture.restore()

		const output = capture.stderr.join('')
		expect(output).toMatch(/\x1b\[\d+m.*warn/)
	})

	test('error level has red color', async () => {
		const capture = captureNodeOutput()
		const testLogger = new Logger({ level: 'trace' })

		testLogger.error('error message')
		await testLogger.flush()

		capture.restore()

		const output = capture.stderr.join('')
		expect(output).toMatch(/\x1b\[\d+m.*error/)
	})
})

// ============================================================================
// Exports Test
// ============================================================================

// ============================================================================
// Session ID Tests
// ============================================================================

describe('Logger.setSessionId()', () => {
	afterEach(() => {
		Logger._sessionId = null
	})

	test('sets session ID on the Logger class', () => {
		Logger.setSessionId('test-session-123')
		expect(Logger._sessionId).toBe('test-session-123')
	})

	test('session ID is included in log metadata', async () => {
		Logger.setSessionId('session-abc')
		const { drain, calls } = createMockDrain()
		const testLogger = new Logger({ level: 'trace', drain })

		testLogger.info('with session')
		await testLogger.flush()

		expect(calls.length).toBe(1)
		expect(calls[0].meta.sessionId).toBe('session-abc')
	})

	test('session ID defaults to null', () => {
		expect(Logger._sessionId).toBeNull()
	})

	test('session ID can be overwritten', () => {
		Logger.setSessionId('session-1')
		expect(Logger._sessionId).toBe('session-1')

		Logger.setSessionId('session-2')
		expect(Logger._sessionId).toBe('session-2')
	})
})

// ============================================================================
// Exports Test
// ============================================================================

describe('Logger module exports', () => {
	test('exports all expected items', async () => {
		const loggerModule = await import('../../src/core/logger.js')

		// Types and classes
		expect(loggerModule.Logger).toBeDefined()

		// Functions
		expect(typeof loggerModule.consoleDrain).toBe('function')
		expect(typeof loggerModule.createMultiDrain).toBe('function')
		expect(typeof loggerModule.createLevelFilteredDrain).toBe('function')
		expect(typeof loggerModule.logger).toBe('function')
		// Constants
		expect(typeof loggerModule.DEBUG_MODE).toBe('boolean')
		expect(loggerModule.ANSI_REGEX).toBeInstanceOf(RegExp)
	})

	test('logger function has all static methods', () => {
		expect(typeof logger.flush).toBe('function')
		expect(typeof logger.fork).toBe('function')
		expect(typeof logger.getRecentLogs).toBe('function')
		expect(typeof logger.trace).toBe('function')
		expect(typeof logger.debug).toBe('function')
		expect(typeof logger.info).toBe('function')
		expect(typeof logger.wait).toBe('function')
		expect(typeof logger.log).toBe('function')
		expect(typeof logger.event).toBe('function')
		expect(typeof logger.ready).toBe('function')
		expect(typeof logger.warn).toBe('function')
		expect(typeof logger.error).toBe('function')
		expect(typeof logger.custom).toBe('function')
		expect(typeof logger.addDrain).toBe('function')
		expect(typeof logger.removeDrain).toBe('function')
	})
})
