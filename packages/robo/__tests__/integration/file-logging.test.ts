import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Logger, createMultiDrain } from '../../src/core/logger.js'
import { createFileDrain } from '../../src/core/drains.js'
import { cleanupTempDir, createTempLogDir, readLogFile, createMockDrain } from '../utils/logging-test-helpers.js'

describe('File Logging Integration', () => {
	let tempDir: string

	beforeEach(() => {
		tempDir = createTempLogDir()
	})

	afterEach(() => {
		cleanupTempDir(tempDir)
	})

	describe('imperative API', () => {
		test('addDrain adds file logging at runtime', async () => {
			const logPath = join(tempDir, 'runtime.log')
			const testLogger = new Logger({
				level: 'debug',
				drain: async () => {} // No-op primary drain
			})

			// Initially no file
			expect(existsSync(logPath)).toBe(false)

			// Add file drain at runtime
			const fileDrain = createFileDrain({
				path: logPath,
				blocking: true,
				timestamp: 'iso'
			})
			const handle = testLogger.addDrain(fileDrain, 'runtime-file')

			testLogger.info('Runtime log message')
			await testLogger.flush()

			// File should now exist with content
			expect(existsSync(logPath)).toBe(true)
			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('Runtime log message')

			// Cleanup
			handle.remove()
		})

		test('removeDrain stops file logging', async () => {
			const logPath = join(tempDir, 'removable.log')
			const testLogger = new Logger({
				level: 'debug',
				drain: async () => {}
			})

			const fileDrain = createFileDrain({ path: logPath, blocking: true })
			const handle = testLogger.addDrain(fileDrain)

			testLogger.info('message 1')
			await testLogger.flush()

			const linesBefore = readLogFile(logPath).length
			expect(linesBefore).toBe(1)

			// Remove the drain
			handle.remove()

			testLogger.info('message 2')
			testLogger.info('message 3')
			await testLogger.flush()

			// Should still have only 1 line
			const linesAfter = readLogFile(logPath).length
			expect(linesAfter).toBe(1)
		})

		test('per-test-file logging pattern', async () => {
			const testFilePath = 'my-feature.test.ts'
			const logPath = join(tempDir, 'logs', 'test', `${testFilePath.replace('.ts', '.log')}`)

			const testLogger = new Logger({
				level: 'debug',
				drain: async () => {}
			})

			// Setup test logging (as would be done in test setup)
			const drain = createFileDrain({
				path: logPath,
				blocking: true,
				timestamp: 'iso',
				stripAnsi: true
			})
			const handle = testLogger.addDrain(drain, `test-${testFilePath}`)

			// Log during test
			testLogger.info('Test setup complete')
			testLogger.debug('Running test assertions')
			testLogger.info('Test passed')

			await handle.flush()

			// Verify log file exists and has content
			expect(existsSync(logPath)).toBe(true)
			const lines = readLogFile(logPath)
			expect(lines.length).toBe(3)
			expect(lines.some((l) => l.includes('Test setup complete'))).toBe(true)
			expect(lines.some((l) => l.includes('Running test assertions'))).toBe(true)
			expect(lines.some((l) => l.includes('Test passed'))).toBe(true)

			// All lines should have timestamps
			lines.forEach((line) => {
				expect(line).toMatch(/\[\d{4}-\d{2}-\d{2}T/)
			})

			// Cleanup (as would be done in afterAll)
			handle.remove()
		})
	})

	describe('multi-output logging', () => {
		test('logs to console and file simultaneously', async () => {
			const logPath = join(tempDir, 'multi.log')
			const { drain: mockConsoleDrain, calls: consoleCalls } = createMockDrain()

			const fileDrain = createFileDrain({ path: logPath, blocking: true })
			const multiDrain = createMultiDrain([mockConsoleDrain, fileDrain])

			const testLogger = new Logger({
				level: 'debug',
				drain: multiDrain
			})

			testLogger.info('Multi-output message')
			await testLogger.flush()

			// Console mock should have received the log
			expect(consoleCalls.length).toBe(1)

			// File should have the log
			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('Multi-output message')
		})

		test('logs to multiple files simultaneously', async () => {
			const infoLogPath = join(tempDir, 'info.log')
			const errorLogPath = join(tempDir, 'error.log')

			const infoDrain = createFileDrain({
				path: infoLogPath,
				blocking: true,
				level: 'info'
			})

			const errorDrain = createFileDrain({
				path: errorLogPath,
				blocking: true,
				level: 'error'
			})

			const testLogger = new Logger({
				level: 'trace',
				drain: async () => {} // No-op primary
			})

			testLogger.addDrain(infoDrain, 'info-file')
			testLogger.addDrain(errorDrain, 'error-file')

			testLogger.debug('debug message')
			testLogger.info('info message')
			testLogger.warn('warn message')
			testLogger.error('error message')

			await testLogger.flush()

			// Info log should have info, warn, error (all >= info level)
			const infoLines = readLogFile(infoLogPath)
			expect(infoLines.some((l) => l.includes('info message'))).toBe(true)
			expect(infoLines.some((l) => l.includes('warn message'))).toBe(true)
			expect(infoLines.some((l) => l.includes('error message'))).toBe(true)
			expect(infoLines.some((l) => l.includes('debug message'))).toBe(false)

			// Error log should only have error
			const errorLines = readLogFile(errorLogPath)
			expect(errorLines.length).toBe(1)
			expect(errorLines[0]).toContain('error message')
		})
	})

	describe('crash resilience (blocking mode)', () => {
		test('blocking drain writes are on disk immediately', async () => {
			const logPath = join(tempDir, 'blocking.log')
			const testLogger = new Logger({
				level: 'debug',
				drain: async () => {}
			})

			const drain = createFileDrain({
				path: logPath,
				blocking: true // Key: blocking mode
			})
			testLogger.addDrain(drain)

			testLogger.info('Critical message before potential crash')

			// No flush called - in blocking mode it should be on disk immediately
			// (though we still need to wait for the logger's internal promise)
			await new Promise((r) => setTimeout(r, 10))

			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('Critical message before potential crash')
		})
	})

	describe('long-running scenarios', () => {
		test('handles many log entries without issues', async () => {
			const logPath = join(tempDir, 'many-entries.log')
			const testLogger = new Logger({
				level: 'debug',
				drain: async () => {}
			})

			const drain = createFileDrain({
				path: logPath,
				blocking: true,
				maxSize: 1024 * 1024 // 1MB - won't rotate during test
			})
			testLogger.addDrain(drain)

			// Write many entries
			const entryCount = 100
			for (let i = 0; i < entryCount; i++) {
				testLogger.info(`Entry ${i}: ${'x'.repeat(50)}`)
			}

			await testLogger.flush()

			const lines = readLogFile(logPath)
			expect(lines.length).toBe(entryCount)
		})

		test('rotation works under continuous logging', async () => {
			const logPath = join(tempDir, 'rotation.log')
			const testLogger = new Logger({
				level: 'debug',
				drain: async () => {}
			})

			const drain = createFileDrain({
				path: logPath,
				blocking: true,
				maxSize: 500, // Small size to trigger rotation
				maxFiles: 3
			})
			testLogger.addDrain(drain)

			// Write enough to trigger multiple rotations
			for (let i = 0; i < 20; i++) {
				testLogger.info(`Long message that will fill the file quickly: ${i} ${'x'.repeat(100)}`)
			}

			await testLogger.flush()

			// Should have current file and some rotated files
			expect(existsSync(logPath)).toBe(true)
			expect(existsSync(`${logPath}.1`)).toBe(true)

			// Current file should be small (under maxSize)
			const { size } = statSync(logPath)
			expect(size).toBeLessThan(600) // Some buffer for the last write
		})
	})

	describe('forked loggers', () => {
		test('forked logger writes to parent file drains', async () => {
			const logPath = join(tempDir, 'forked.log')
			const testLogger = new Logger({
				level: 'debug',
				drain: async () => {}
			})

			const drain = createFileDrain({ path: logPath, blocking: true })
			testLogger.addDrain(drain)

			const forkedLogger = testLogger.fork('myPlugin')
			forkedLogger.info('Message from forked logger')

			await testLogger.flush()

			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('Message from forked logger')
		})

		test('addDrain on forked logger delegates to parent', async () => {
			const logPath = join(tempDir, 'forked-add.log')
			const testLogger = new Logger({
				level: 'debug',
				drain: async () => {}
			})

			const forkedLogger = testLogger.fork('myPlugin')

			// Add drain via forked logger (should delegate to parent)
			const drain = createFileDrain({ path: logPath, blocking: true })
			const handle = forkedLogger.addDrain(drain)

			// Log from both loggers
			testLogger.info('From parent')
			forkedLogger.info('From forked')

			await testLogger.flush()

			const lines = readLogFile(logPath)
			expect(lines.some((l) => l.includes('From parent'))).toBe(true)
			expect(lines.some((l) => l.includes('From forked'))).toBe(true)

			handle.remove()
		})
	})
})
