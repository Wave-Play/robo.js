import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { createFileDrain } from '../../src/core/file-drain.js'
import { Logger, createLevelFilteredDrain, createMultiDrain } from '../../src/core/logger.js'
import {
	cleanupTempDir,
	createTempLogDir,
	readLogFile,
	createMockDrain,
	getAutoLogPath
} from '../utils/logging-test-helpers.js'

describe('Auto File Logging Integration', () => {
	let tempDir: string

	beforeEach(() => {
		tempDir = createTempLogDir()
	})

	afterEach(() => {
		cleanupTempDir(tempDir)
	})

	describe('file drain creation by mode', () => {
		test('creates .robo/logs/development.log in development mode', async () => {
			const mode = 'development'
			const logPath = join(tempDir, getAutoLogPath(mode))
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			const testLogger = new Logger({
				level: 'debug',
				drain: createMultiDrain([async () => {}, drain])
			})

			testLogger.info('Development mode test message')
			await testLogger.flush()

			expect(existsSync(logPath)).toBe(true)
			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('Development mode test message')
		})

		test('creates .robo/logs/production.log in production mode', async () => {
			const mode = 'production'
			const logPath = join(tempDir, getAutoLogPath(mode))
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			const testLogger = new Logger({
				level: 'debug',
				drain: createMultiDrain([async () => {}, drain])
			})

			testLogger.info('Production mode test message')
			await testLogger.flush()

			expect(existsSync(logPath)).toBe(true)
			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('Production mode test message')
		})

		test('creates .robo/logs/beta.log for custom beta mode', async () => {
			const mode = 'beta'
			const logPath = join(tempDir, getAutoLogPath(mode))
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			const testLogger = new Logger({
				level: 'debug',
				drain: createMultiDrain([async () => {}, drain])
			})

			testLogger.info('Beta mode test message')
			await testLogger.flush()

			expect(existsSync(logPath)).toBe(true)
			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('Beta mode test message')
		})

		test('creates .robo/logs/staging.log for staging mode', async () => {
			const mode = 'staging'
			const logPath = join(tempDir, getAutoLogPath(mode))
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			const testLogger = new Logger({
				level: 'debug',
				drain: createMultiDrain([async () => {}, drain])
			})

			testLogger.info('Staging mode test message')
			await testLogger.flush()

			expect(existsSync(logPath)).toBe(true)
			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('Staging mode test message')
		})

		test('creates .robo/logs/default.log for empty mode fallback', async () => {
			const mode = ''
			const logPath = join(tempDir, getAutoLogPath(mode))
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			const testLogger = new Logger({
				level: 'debug',
				drain: drain
			})

			testLogger.info('Default mode test message')
			await testLogger.flush()

			expect(existsSync(logPath)).toBe(true)
			expect(logPath).toContain('.robo/logs/default.log')
		})
	})

	describe('log content verification', () => {
		test('logs all levels with debug minimum', async () => {
			const logPath = join(tempDir, '.robo/logs/all-levels.log')
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			const testLogger = new Logger({
				level: 'trace',
				drain: drain
			})

			testLogger.debug('Debug message')
			testLogger.info('Info message')
			testLogger.warn('Warn message')
			testLogger.error('Error message')

			await testLogger.flush()

			const lines = readLogFile(logPath)
			expect(lines.length).toBe(4)
			expect(lines.some((l) => l.includes('Debug message'))).toBe(true)
			expect(lines.some((l) => l.includes('Info message'))).toBe(true)
			expect(lines.some((l) => l.includes('Warn message'))).toBe(true)
			expect(lines.some((l) => l.includes('Error message'))).toBe(true)
		})

		test('includes short timestamp in format HH:mm:ss.SSS', async () => {
			const logPath = join(tempDir, '.robo/logs/timestamp-test.log')
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			const testLogger = new Logger({
				level: 'debug',
				drain: drain
			})

			testLogger.info('Timestamp test')
			await testLogger.flush()

			const content = readFileSync(logPath, 'utf-8')
			// Short format: [HH:mm:ss.SSS]
			expect(content).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/)
		})

		test('strips ANSI codes from file output', async () => {
			const logPath = join(tempDir, '.robo/logs/ansi-test.log')
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			const testLogger = new Logger({
				level: 'debug',
				drain: drain
			})

			testLogger.info('\x1b[31mRed text\x1b[0m')
			await testLogger.flush()

			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('Red text')
			expect(content).not.toContain('\x1b[31m')
			expect(content).not.toContain('\x1b[0m')
		})

		test('handles error objects in logs', async () => {
			const logPath = join(tempDir, '.robo/logs/error-test.log')
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			const testLogger = new Logger({
				level: 'debug',
				drain: drain
			})

			const error = new Error('Test error message')
			testLogger.error('An error occurred:', error)
			await testLogger.flush()

			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('An error occurred:')
			expect(content).toContain('Test error message')
		})

		test('handles object data in logs', async () => {
			const logPath = join(tempDir, '.robo/logs/object-test.log')
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			const testLogger = new Logger({
				level: 'debug',
				drain: drain
			})

			testLogger.info('User data:', { id: 123, name: 'Test User' })
			await testLogger.flush()

			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('User data:')
			expect(content).toContain('"id": 123')
			expect(content).toContain('"name": "Test User"')
		})
	})

	describe('directory creation', () => {
		test('creates .robo/logs directory if not exists', async () => {
			const roboLogsDir = join(tempDir, '.robo/logs')
			const logPath = join(roboLogsDir, 'test.log')

			expect(existsSync(roboLogsDir)).toBe(false)

			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				blocking: true
			})

			const testLogger = new Logger({ drain })
			testLogger.info('Test message')
			await testLogger.flush()

			expect(existsSync(roboLogsDir)).toBe(true)
			expect(existsSync(logPath)).toBe(true)
		})

		test('creates deeply nested directory structure', async () => {
			const logPath = join(tempDir, '.robo', 'logs', 'subdir', 'deep', 'test.log')

			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				blocking: true
			})

			const testLogger = new Logger({ drain })
			testLogger.info('Deep nested message')
			await testLogger.flush()

			expect(existsSync(logPath)).toBe(true)
		})
	})

	describe('explicit config overrides auto-logging', () => {
		test('uses custom path when files config is set', async () => {
			const customPath = join(tempDir, 'custom/my-app.log')
			const autoPath = join(tempDir, '.robo/logs/production.log')

			// Simulate explicit config - only create drain from config
			const drain = createFileDrain({
				path: customPath,
				level: 'info',
				blocking: true
			})

			const testLogger = new Logger({ drain })
			testLogger.info('Custom path message')
			await testLogger.flush()

			expect(existsSync(customPath)).toBe(true)
			expect(existsSync(autoPath)).toBe(false)
		})

		test('no file created when using no-op drain (simulating empty files config)', async () => {
			const autoPath = join(tempDir, '.robo/logs/production.log')

			// Simulate empty files config - no file drain created
			const testLogger = new Logger({
				drain: async () => {} // No-op drain
			})

			testLogger.info('No file message')
			await testLogger.flush()

			expect(existsSync(autoPath)).toBe(false)
		})
	})

	describe('multi-output logging', () => {
		test('logs to console and auto file simultaneously', async () => {
			const logPath = join(tempDir, '.robo/logs/multi-output.log')
			const { drain: mockConsoleDrain, calls: consoleCalls } = createMockDrain()

			const fileDrain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})
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

		test('file drain works alongside console drain in production setup', async () => {
			const logPath = join(tempDir, '.robo/logs/production-setup.log')
			const { drain: mockConsoleDrain, calls: consoleCalls } = createMockDrain()

			// Simulate production setup: console (info level) + file (debug level)
			const fileDrain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			const testLogger = new Logger({
				level: 'debug',
				drain: createMultiDrain([mockConsoleDrain, fileDrain])
			})

			testLogger.debug('Debug only in file')
			testLogger.info('Info in both')
			testLogger.error('Error in both')

			await testLogger.flush()

			// Console mock receives all (filtering would be done at drain level)
			expect(consoleCalls.length).toBe(3)

			// File should have all debug+ messages
			const lines = readLogFile(logPath)
			expect(lines.some((l) => l.includes('Debug only in file'))).toBe(true)
			expect(lines.some((l) => l.includes('Info in both'))).toBe(true)
			expect(lines.some((l) => l.includes('Error in both'))).toBe(true)
		})

		test('auto file drain respects explicit logger level', async () => {
			const logPath = join(tempDir, '.robo/logs/warn-level.log')
			const { drain: mockConsoleDrain, calls: consoleCalls } = createMockDrain()
			const effectiveLevel = 'warn'
			const fileDrain = createFileDrain({
				path: logPath,
				level: effectiveLevel,
				timestamp: 'short',
				blocking: true
			})

			const testLogger = new Logger({
				level: effectiveLevel,
				drain: createMultiDrain([createLevelFilteredDrain(mockConsoleDrain, effectiveLevel), fileDrain])
			})

			testLogger.event('Event should be filtered')
			testLogger.warn('Warn should pass')

			await testLogger.flush()

			expect(consoleCalls.map((call) => call.level)).toEqual(['warn'])
			const content = readFileSync(logPath, 'utf-8')
			expect(content).not.toContain('Event should be filtered')
			expect(content).toContain('Warn should pass')
		})
	})

	describe('forked loggers with auto file drain', () => {
		test('forked logger writes to parent auto file drain', async () => {
			const logPath = join(tempDir, '.robo/logs/forked.log')
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			const testLogger = new Logger({
				level: 'debug',
				drain: drain
			})

			const forkedLogger = testLogger.fork('myPlugin')
			forkedLogger.info('Message from forked logger')

			await testLogger.flush()

			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('Message from forked logger')
		})

		test('multiple forked loggers write to same auto file', async () => {
			const logPath = join(tempDir, '.robo/logs/multi-fork.log')
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			const testLogger = new Logger({
				level: 'debug',
				drain: drain
			})

			const pluginA = testLogger.fork('pluginA')
			const pluginB = testLogger.fork('pluginB')
			const pluginC = testLogger.fork('pluginC')

			testLogger.info('Root logger message')
			pluginA.info('Plugin A message')
			pluginB.info('Plugin B message')
			pluginC.info('Plugin C message')

			await testLogger.flush()

			const lines = readLogFile(logPath)
			expect(lines.length).toBe(4)
			expect(lines.some((l) => l.includes('Root logger message'))).toBe(true)
			expect(lines.some((l) => l.includes('Plugin A message'))).toBe(true)
			expect(lines.some((l) => l.includes('Plugin B message'))).toBe(true)
			expect(lines.some((l) => l.includes('Plugin C message'))).toBe(true)
		})
	})

	describe('file rotation with auto file drain', () => {
		test('auto file drain rotates when size exceeded', async () => {
			const logPath = join(tempDir, '.robo/logs/rotation.log')
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true,
				maxSize: 500, // Small size to trigger rotation
				maxFiles: 3
			})

			const testLogger = new Logger({
				level: 'debug',
				drain: drain
			})

			// Write enough to trigger rotation
			for (let i = 0; i < 20; i++) {
				testLogger.info(`Long message that will fill the file quickly: ${i} ${'x'.repeat(50)}`)
			}

			await testLogger.flush()

			// Should have current file and rotated files
			expect(existsSync(logPath)).toBe(true)
			expect(existsSync(`${logPath}.1`)).toBe(true)
		})
	})

	describe('crash resilience', () => {
		test('blocking drain writes are on disk immediately', async () => {
			const logPath = join(tempDir, '.robo/logs/blocking.log')
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true // Critical for crash resilience
			})

			const testLogger = new Logger({
				level: 'debug',
				drain: drain
			})

			testLogger.info('Critical message before potential crash')

			// In blocking mode, should be on disk immediately
			await new Promise((r) => setTimeout(r, 10))

			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('Critical message before potential crash')
		})
	})

	describe('console vs file level filtering', () => {
		test('file captures debug while console filtered to info', async () => {
			const logPath = join(tempDir, '.robo/logs/level-filter-test.log')
			const { drain: mockConsoleDrain, calls: consoleCalls } = createMockDrain()

			// Import the level filtered drain creator
			const { createLevelFilteredDrain } = await import('../../src/core/logger.js')

			// Create file drain at debug level
			const fileDrain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			// Create console drain filtered to info level (simulates production setup)
			const filteredConsoleDrain = createLevelFilteredDrain(mockConsoleDrain, 'info')

			// Combine both drains
			const multiDrain = createMultiDrain([filteredConsoleDrain, fileDrain])

			const testLogger = new Logger({
				level: 'trace', // Allow all levels through to drains
				drain: multiDrain
			})

			// Log at different levels
			testLogger.debug('debug message')
			testLogger.info('info message')
			testLogger.warn('warn message')

			await testLogger.flush()

			// Console should only have info and warn (filtered out debug)
			expect(consoleCalls.length).toBe(2)
			expect(consoleCalls.some((c) => c.level === 'debug')).toBe(false)
			expect(consoleCalls.some((c) => c.level === 'info')).toBe(true)
			expect(consoleCalls.some((c) => c.level === 'warn')).toBe(true)

			// File should have all three
			const lines = readLogFile(logPath)
			expect(lines.length).toBe(3)
			expect(lines.some((l) => l.includes('debug message'))).toBe(true)
			expect(lines.some((l) => l.includes('info message'))).toBe(true)
			expect(lines.some((l) => l.includes('warn message'))).toBe(true)
		})

		test('trace messages blocked from both console and file by default', async () => {
			const logPath = join(tempDir, '.robo/logs/trace-test.log')
			const { drain: mockConsoleDrain, calls: consoleCalls } = createMockDrain()

			const { createLevelFilteredDrain } = await import('../../src/core/logger.js')

			// File drain at debug level (trace is below debug)
			const fileDrain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			// Console filtered to info level
			const filteredConsoleDrain = createLevelFilteredDrain(mockConsoleDrain, 'info')

			const multiDrain = createMultiDrain([filteredConsoleDrain, fileDrain])

			const testLogger = new Logger({
				level: 'trace',
				drain: multiDrain
			})

			testLogger.trace('trace message')
			testLogger.debug('debug message')
			testLogger.info('info message')

			await testLogger.flush()

			// Console should only have info
			expect(consoleCalls.length).toBe(1)
			expect(consoleCalls[0].level).toBe('info')

			// File should have debug and info, but not trace
			const lines = readLogFile(logPath)
			expect(lines.length).toBe(2)
			expect(lines.some((l) => l.includes('trace message'))).toBe(false)
			expect(lines.some((l) => l.includes('debug message'))).toBe(true)
			expect(lines.some((l) => l.includes('info message'))).toBe(true)
		})
	})
})
