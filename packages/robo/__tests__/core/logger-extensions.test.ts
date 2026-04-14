import { createMultiDrain, createLevelFilteredDrain, Logger, logger } from '../../src/core/logger.js'
import { createMockDrain, createDelayedMockDrain, createTestMeta } from '../utils/logging-test-helpers.js'

describe('createMultiDrain', () => {
	test('calls all drains with same arguments', async () => {
		const { drain: drain1, calls: calls1 } = createMockDrain()
		const { drain: drain2, calls: calls2 } = createMockDrain()
		const { drain: drain3, calls: calls3 } = createMockDrain()

		const multiDrain = createMultiDrain([drain1, drain2, drain3])
		const testLogger = new Logger({ level: 'trace' })

		const meta = createTestMeta()
		await multiDrain(testLogger, 'info', meta, 'test message', { key: 'value' })

		expect(calls1.length).toBe(1)
		expect(calls2.length).toBe(1)
		expect(calls3.length).toBe(1)

		// All should have received the same arguments
		expect(calls1[0].level).toBe('info')
		expect(calls1[0].data).toEqual(['test message', { key: 'value' }])
		expect(calls2[0].level).toBe('info')
		expect(calls3[0].level).toBe('info')
	})

	test('waits for all drains to complete', async () => {
		const { drain: slowDrain, calls: slowCalls } = createDelayedMockDrain(50)
		const { drain: fastDrain, calls: fastCalls } = createMockDrain()

		const multiDrain = createMultiDrain([slowDrain, fastDrain])
		const testLogger = new Logger({ level: 'trace' })

		await multiDrain(testLogger, 'info', createTestMeta(), 'test')

		// Both should have been called by the time the promise resolves
		expect(slowCalls.length).toBe(1)
		expect(fastCalls.length).toBe(1)
	})

	test('handles empty drain array', async () => {
		const multiDrain = createMultiDrain([])
		const testLogger = new Logger({ level: 'trace' })

		// Should not throw
		await expect(multiDrain(testLogger, 'info', createTestMeta(), 'test')).resolves.toBeUndefined()
	})

	test('handles single drain', async () => {
		const { drain, calls } = createMockDrain()
		const multiDrain = createMultiDrain([drain])
		const testLogger = new Logger({ level: 'trace' })

		await multiDrain(testLogger, 'info', createTestMeta(), 'single drain test')

		expect(calls.length).toBe(1)
		expect(calls[0].data).toEqual(['single drain test'])
	})

	test('continues calling other drains if one throws', async () => {
		const errorDrain = async () => {
			throw new Error('Drain error')
		}
		const { drain: successDrain, calls: successCalls } = createMockDrain()

		const multiDrain = createMultiDrain([errorDrain, successDrain])
		const testLogger = new Logger({ level: 'trace' })

		// Should not throw even though one drain throws
		await expect(multiDrain(testLogger, 'info', createTestMeta(), 'test')).resolves.toBeUndefined()

		// The successful drain should still be called
		expect(successCalls.length).toBe(1)
	})
})

describe('Logger.addDrain', () => {
	let testLogger: Logger

	beforeEach(() => {
		// Create a fresh logger with a no-op primary drain to isolate tests
		testLogger = new Logger({
			level: 'trace',
			drain: async () => {} // No-op drain
		})
	})

	test('adds drain and includes it in logging', async () => {
		const { drain, calls } = createMockDrain()

		testLogger.addDrain(drain)
		testLogger.info('test message')

		// Wait for async drain
		await testLogger.flush()

		expect(calls.length).toBe(1)
	})

	test('returns DrainHandle with id', () => {
		const { drain } = createMockDrain()

		const handle = testLogger.addDrain(drain)

		expect(handle.id).toBeDefined()
		expect(typeof handle.id).toBe('string')
		expect(handle.id.length).toBeGreaterThan(0)
	})

	test('uses provided id if given', () => {
		const { drain } = createMockDrain()

		const handle = testLogger.addDrain(drain, 'my-custom-drain-id')

		expect(handle.id).toBe('my-custom-drain-id')
	})

	test('generates unique id if not provided', () => {
		const { drain: drain1 } = createMockDrain()
		const { drain: drain2 } = createMockDrain()

		const handle1 = testLogger.addDrain(drain1)
		const handle2 = testLogger.addDrain(drain2)

		expect(handle1.id).not.toBe(handle2.id)
	})

	test('multiple drains receive same log entries', async () => {
		const { drain: drain1, calls: calls1 } = createMockDrain()
		const { drain: drain2, calls: calls2 } = createMockDrain()

		testLogger.addDrain(drain1)
		testLogger.addDrain(drain2)

		testLogger.info('shared message')
		await testLogger.flush()

		expect(calls1.length).toBe(1)
		expect(calls2.length).toBe(1)
	})
})

describe('Logger.removeDrain', () => {
	let testLogger: Logger

	beforeEach(() => {
		testLogger = new Logger({
			level: 'trace',
			drain: async () => {}
		})
	})

	test('removes drain by id', async () => {
		const { drain, calls } = createMockDrain()
		testLogger.addDrain(drain, 'test-drain')

		testLogger.info('before removal')
		await testLogger.flush()
		expect(calls.length).toBe(1)

		testLogger.removeDrain('test-drain')

		testLogger.info('after removal')
		await testLogger.flush()
		expect(calls.length).toBe(1) // Should not increase
	})

	test('returns true if drain was removed', () => {
		const { drain } = createMockDrain()
		testLogger.addDrain(drain, 'test-drain')

		const result = testLogger.removeDrain('test-drain')

		expect(result).toBe(true)
	})

	test('returns false if drain not found', () => {
		const result = testLogger.removeDrain('nonexistent-drain')

		expect(result).toBe(false)
	})

	test('removed drain no longer receives logs', async () => {
		const { drain, calls } = createMockDrain()
		const handle = testLogger.addDrain(drain)

		handle.remove()

		testLogger.info('after removal')
		await testLogger.flush()

		expect(calls.length).toBe(0)
	})
})

describe('DrainHandle', () => {
	let testLogger: Logger

	beforeEach(() => {
		testLogger = new Logger({
			level: 'trace',
			drain: async () => {}
		})
	})

	test('remove() removes the drain', async () => {
		const { drain, calls } = createMockDrain()
		const handle = testLogger.addDrain(drain)

		testLogger.info('before')
		await testLogger.flush()
		expect(calls.length).toBe(1)

		handle.remove()

		testLogger.info('after')
		await testLogger.flush()
		expect(calls.length).toBe(1) // Should not increase
	})

	test('flush() waits for pending writes', async () => {
		const { drain: slowDrain, calls } = createDelayedMockDrain(50)
		const handle = testLogger.addDrain(slowDrain)

		testLogger.info('test')
		await handle.flush()

		expect(calls.length).toBe(1)
	})

	test('id matches the drain identifier', () => {
		const { drain } = createMockDrain()
		const handle = testLogger.addDrain(drain, 'specific-id')

		expect(handle.id).toBe('specific-id')
	})
})

describe('logger.addDrain (singleton)', () => {
	beforeEach(() => {
		// Initialize the singleton with a no-op drain
		logger({
			level: 'trace',
			drain: async () => {}
		})
	})

	test('delegates to singleton instance', async () => {
		const { drain, calls } = createMockDrain()

		const handle = logger.addDrain(drain, 'singleton-test')

		logger.info('test from singleton')
		await logger.flush()

		expect(calls.length).toBeGreaterThanOrEqual(1)

		// Cleanup
		handle.remove()
	})

	test('works with forked loggers', async () => {
		const { drain, calls } = createMockDrain()
		const handle = logger.addDrain(drain, 'fork-test')

		const forkedLogger = logger.fork('test-prefix')
		forkedLogger.info('forked message')
		await logger.flush()

		// Forked logger should delegate to parent which has the drain
		expect(calls.length).toBeGreaterThanOrEqual(1)

		// Cleanup
		handle.remove()
	})
})

describe('createLevelFilteredDrain', () => {
	test('passes messages at or above minimum level', async () => {
		const { drain, calls } = createMockDrain()
		const filteredDrain = createLevelFilteredDrain(drain, 'info')
		const testLogger = new Logger({ level: 'trace' })

		await filteredDrain(testLogger, 'info', createTestMeta(), 'info message')
		await filteredDrain(testLogger, 'warn', createTestMeta(), 'warn message')
		await filteredDrain(testLogger, 'error', createTestMeta(), 'error message')

		expect(calls.length).toBe(3)
		expect(calls[0].level).toBe('info')
		expect(calls[1].level).toBe('warn')
		expect(calls[2].level).toBe('error')
	})

	test('blocks messages below minimum level', async () => {
		const { drain, calls } = createMockDrain()
		const filteredDrain = createLevelFilteredDrain(drain, 'info')
		const testLogger = new Logger({ level: 'trace' })

		await filteredDrain(testLogger, 'debug', createTestMeta(), 'debug message')
		await filteredDrain(testLogger, 'trace', createTestMeta(), 'trace message')

		expect(calls.length).toBe(0)
	})

	test('debug level filter allows debug and above', async () => {
		const { drain, calls } = createMockDrain()
		const filteredDrain = createLevelFilteredDrain(drain, 'debug')
		const testLogger = new Logger({ level: 'trace' })

		await filteredDrain(testLogger, 'trace', createTestMeta(), 'trace message')
		await filteredDrain(testLogger, 'debug', createTestMeta(), 'debug message')
		await filteredDrain(testLogger, 'info', createTestMeta(), 'info message')

		expect(calls.length).toBe(2)
		expect(calls[0].level).toBe('debug')
		expect(calls[1].level).toBe('info')
	})

	test('warn level filter blocks info and below', async () => {
		const { drain, calls } = createMockDrain()
		const filteredDrain = createLevelFilteredDrain(drain, 'warn')
		const testLogger = new Logger({ level: 'trace' })

		await filteredDrain(testLogger, 'debug', createTestMeta(), 'debug message')
		await filteredDrain(testLogger, 'info', createTestMeta(), 'info message')
		await filteredDrain(testLogger, 'warn', createTestMeta(), 'warn message')
		await filteredDrain(testLogger, 'error', createTestMeta(), 'error message')

		expect(calls.length).toBe(2)
		expect(calls[0].level).toBe('warn')
		expect(calls[1].level).toBe('error')
	})

	test('works with multi-drain composition', async () => {
		const { drain: drain1, calls: calls1 } = createMockDrain()
		const { drain: drain2, calls: calls2 } = createMockDrain()

		// drain1 filters at info, drain2 filters at debug
		const filteredDrain1 = createLevelFilteredDrain(drain1, 'info')
		const filteredDrain2 = createLevelFilteredDrain(drain2, 'debug')

		const multiDrain = createMultiDrain([filteredDrain1, filteredDrain2])
		const testLogger = new Logger({ level: 'trace' })

		await multiDrain(testLogger, 'debug', createTestMeta(), 'debug message')
		await multiDrain(testLogger, 'info', createTestMeta(), 'info message')

		// drain1 should only have info message
		expect(calls1.length).toBe(1)
		expect(calls1[0].level).toBe('info')

		// drain2 should have both debug and info
		expect(calls2.length).toBe(2)
		expect(calls2[0].level).toBe('debug')
		expect(calls2[1].level).toBe('info')
	})

	test('preserves message data when passing through', async () => {
		const { drain, calls } = createMockDrain()
		const filteredDrain = createLevelFilteredDrain(drain, 'info')
		const testLogger = new Logger({ level: 'trace' })

		const testData = { key: 'value', nested: { foo: 'bar' } }
		await filteredDrain(testLogger, 'info', createTestMeta(), 'message', testData, 123)

		expect(calls.length).toBe(1)
		expect(calls[0].data).toEqual(['message', testData, 123])
	})

	test('handles custom log levels', async () => {
		const { drain, calls } = createMockDrain()
		const filteredDrain = createLevelFilteredDrain(drain, 'info')
		const testLogger = new Logger({
			level: 'trace',
			customLevels: {
				custom: { priority: 5, label: 'CUSTOM' } // Between event(5) and ready(6)
			}
		})

		await filteredDrain(testLogger, 'custom', createTestMeta(), 'custom level message')

		// custom (priority 5) >= info (priority 2), so should pass
		expect(calls.length).toBe(1)
		expect(calls[0].level).toBe('custom')
	})
})
