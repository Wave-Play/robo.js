import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { createFileDrain } from '../../src/core/file-drain.js'
import { Logger } from '../../src/core/logger.js'
import {
	cleanupTempDir,
	createTempLogDir,
	readLogFile,
	shouldCreateAutoFileDrain,
	getAutoLogPath,
	createTestMeta
} from '../utils/logging-test-helpers.js'

describe('Auto File Logging Configuration', () => {
	let tempDir: string
	let testLogger: Logger

	beforeEach(() => {
		tempDir = createTempLogDir()
		testLogger = new Logger({ level: 'trace' })
	})

	afterEach(() => {
		cleanupTempDir(tempDir)
	})

	describe('log path resolution', () => {
		test('uses .robo/logs/development.log for development mode', () => {
			const mode = 'development'
			const expectedPath = getAutoLogPath(mode)
			expect(expectedPath).toBe('.robo/logs/development.log')
		})

		test('uses .robo/logs/production.log for production mode', () => {
			const mode = 'production'
			const expectedPath = getAutoLogPath(mode)
			expect(expectedPath).toBe('.robo/logs/production.log')
		})

		test('uses .robo/logs/beta.log for custom beta mode', () => {
			const mode = 'beta'
			const expectedPath = getAutoLogPath(mode)
			expect(expectedPath).toBe('.robo/logs/beta.log')
		})

		test('uses .robo/logs/staging.log for custom staging mode', () => {
			const mode = 'staging'
			const expectedPath = getAutoLogPath(mode)
			expect(expectedPath).toBe('.robo/logs/staging.log')
		})

		test('uses .robo/logs/default.log for empty mode', () => {
			const expectedPath = getAutoLogPath('')
			expect(expectedPath).toBe('.robo/logs/default.log')
		})

		test('uses .robo/logs/default.log for null mode', () => {
			const expectedPath = getAutoLogPath(null)
			expect(expectedPath).toBe('.robo/logs/default.log')
		})

		test('uses .robo/logs/default.log for undefined mode', () => {
			const expectedPath = getAutoLogPath(undefined)
			expect(expectedPath).toBe('.robo/logs/default.log')
		})

		test('handles mode with hyphen correctly', () => {
			const mode = 'dev-local'
			const expectedPath = getAutoLogPath(mode)
			expect(expectedPath).toBe('.robo/logs/dev-local.log')
		})

		test('handles mode with underscore correctly', () => {
			const mode = 'prod_v2'
			const expectedPath = getAutoLogPath(mode)
			expect(expectedPath).toBe('.robo/logs/prod_v2.log')
		})
	})

	describe('opt-out behavior', () => {
		test('empty files array disables auto-logging', () => {
			const config: { logger: { files: unknown[] } } = { logger: { files: [] } }
			const shouldCreate = shouldCreateAutoFileDrain(config, false)
			expect(shouldCreate).toBe(false)
		})

		test('undefined files enables auto-logging', () => {
			const config: { logger: { files?: unknown[] } } = { logger: {} }
			const shouldCreate = shouldCreateAutoFileDrain(config, false)
			expect(shouldCreate).toBe(true)
		})

		test('null config enables auto-logging', () => {
			const config: { logger?: { files?: unknown[] } } | null = null
			const shouldCreate = shouldCreateAutoFileDrain(config, false)
			expect(shouldCreate).toBe(true)
		})

		test('undefined config enables auto-logging', () => {
			const config: { logger?: { files?: unknown[] } } | undefined = undefined
			const shouldCreate = shouldCreateAutoFileDrain(config, false)
			expect(shouldCreate).toBe(true)
		})

		test('config without logger field enables auto-logging', () => {
			const config = {}
			const shouldCreate = shouldCreateAutoFileDrain(config, false)
			expect(shouldCreate).toBe(true)
		})

		test('explicit files config disables auto-logging', () => {
			const config = {
				logger: {
					files: [{ path: 'custom/app.log', level: 'info' as const }]
				}
			}
			const shouldCreate = shouldCreateAutoFileDrain(config, false)
			expect(shouldCreate).toBe(false)
		})

		test('multiple files in config disables auto-logging', () => {
			const config = {
				logger: {
					files: [
						{ path: 'logs/app.log', level: 'info' as const },
						{ path: 'logs/error.log', level: 'error' as const }
					]
				}
			}
			const shouldCreate = shouldCreateAutoFileDrain(config, false)
			expect(shouldCreate).toBe(false)
		})
	})

	describe('mock test mode', () => {
		test('mock test mode skips auto file drain creation', () => {
			const config = { logger: {} }
			const shouldCreate = shouldCreateAutoFileDrain(config, true)
			expect(shouldCreate).toBe(false)
		})

		test('mock test mode with null config skips auto file drain creation', () => {
			const shouldCreate = shouldCreateAutoFileDrain(null, true)
			expect(shouldCreate).toBe(false)
		})

		test('mock test mode with undefined config skips auto file drain creation', () => {
			const shouldCreate = shouldCreateAutoFileDrain(undefined, true)
			expect(shouldCreate).toBe(false)
		})

		test('non-mock mode creates auto file drain', () => {
			const config = { logger: {} }
			const shouldCreate = shouldCreateAutoFileDrain(config, false)
			expect(shouldCreate).toBe(true)
		})

		test('non-mock mode with null config creates auto file drain', () => {
			const shouldCreate = shouldCreateAutoFileDrain(null, false)
			expect(shouldCreate).toBe(true)
		})
	})

	describe('default drain options', () => {
		test('auto drain uses debug level for development mode', async () => {
			const logPath = join(tempDir, '.robo/logs/development.log')
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			// Debug should be logged
			await drain(testLogger, 'debug', createTestMeta(), 'debug message')
			await drain(testLogger, 'info', createTestMeta(), 'info message')

			const lines = readLogFile(logPath)
			expect(lines.length).toBe(2)
			expect(lines.some((l) => l.includes('debug message'))).toBe(true)
			expect(lines.some((l) => l.includes('info message'))).toBe(true)
		})

		test('auto drain uses debug level for production mode', async () => {
			const logPath = join(tempDir, '.robo/logs/production.log')
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			await drain(testLogger, 'debug', createTestMeta(), 'production debug message')

			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('production debug message')
		})

		test('auto drain uses debug level for custom modes', async () => {
			const modes = ['beta', 'staging', 'test', 'qa']
			for (const mode of modes) {
				const logPath = join(tempDir, `.robo/logs/${mode}.log`)
				const drain = createFileDrain({
					path: logPath,
					level: 'debug',
					timestamp: 'short',
					blocking: true
				})

				await drain(testLogger, 'debug', createTestMeta(), `${mode} debug message`)

				const content = readFileSync(logPath, 'utf-8')
				expect(content).toContain(`${mode} debug message`)
			}
		})

		test('drain supports short timestamp format', async () => {
			const logPath = join(tempDir, '.robo/logs/timestamp-test.log')
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			await drain(testLogger, 'info', createTestMeta(), 'test message')

			const content = readFileSync(logPath, 'utf-8')
			// Short format: [HH:mm:ss.SSS]
			expect(content).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/)
		})

		test('auto drain strips ANSI codes by default', async () => {
			const logPath = join(tempDir, '.robo/logs/ansi-test.log')
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				timestamp: 'short',
				blocking: true
			})

			await drain(testLogger, 'info', createTestMeta(), '\x1b[31mred text\x1b[0m')

			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('red text')
			expect(content).not.toContain('\x1b[31m')
			expect(content).not.toContain('\x1b[0m')
		})
	})

	describe('file creation', () => {
		test('creates .robo/logs directory if not exists', async () => {
			const roboLogsDir = join(tempDir, '.robo/logs')
			const logPath = join(roboLogsDir, 'test.log')

			expect(existsSync(roboLogsDir)).toBe(false)

			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				blocking: true
			})

			await drain(testLogger, 'info', createTestMeta(), 'Test message')

			expect(existsSync(roboLogsDir)).toBe(true)
			expect(existsSync(logPath)).toBe(true)
		})

		test('creates nested .robo/logs path correctly', async () => {
			const logPath = join(tempDir, '.robo', 'logs', 'production.log')

			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				blocking: true
			})

			await drain(testLogger, 'info', createTestMeta(), 'Nested path test')

			expect(existsSync(logPath)).toBe(true)
			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('Nested path test')
		})

		test('appends to existing log file', async () => {
			const logPath = join(tempDir, '.robo/logs/append-test.log')
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				blocking: true
			})

			await drain(testLogger, 'info', createTestMeta(), 'First message')
			await drain(testLogger, 'info', createTestMeta(), 'Second message')
			await drain(testLogger, 'info', createTestMeta(), 'Third message')

			const lines = readLogFile(logPath)
			expect(lines.length).toBe(3)
			expect(lines[0]).toContain('First message')
			expect(lines[1]).toContain('Second message')
			expect(lines[2]).toContain('Third message')
		})
	})

	describe('level filtering', () => {
		test('debug level logs all levels at or above debug', async () => {
			const logPath = join(tempDir, '.robo/logs/level-test.log')
			const drain = createFileDrain({
				path: logPath,
				level: 'debug',
				blocking: true
			})

			await drain(testLogger, 'trace', createTestMeta(), 'trace message')
			await drain(testLogger, 'debug', createTestMeta(), 'debug message')
			await drain(testLogger, 'info', createTestMeta(), 'info message')
			await drain(testLogger, 'warn', createTestMeta(), 'warn message')
			await drain(testLogger, 'error', createTestMeta(), 'error message')

			const lines = readLogFile(logPath)
			// trace is below debug, so should not be logged
			expect(lines.some((l) => l.includes('trace message'))).toBe(false)
			expect(lines.some((l) => l.includes('debug message'))).toBe(true)
			expect(lines.some((l) => l.includes('info message'))).toBe(true)
			expect(lines.some((l) => l.includes('warn message'))).toBe(true)
			expect(lines.some((l) => l.includes('error message'))).toBe(true)
		})
	})
})
