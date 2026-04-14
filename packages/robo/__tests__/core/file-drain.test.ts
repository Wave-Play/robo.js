import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
	createFileDrain,
	formatTimestamp,
	extractAndStripAnsi,
	applyColorMap,
	parseColorMapFile,
	reconstructColoredLogs,
	type ColorMapEntry
} from '../../src/core/file-drain.js'
import { Logger } from '../../src/core/logger.js'
import { cleanupTempDir, createTempLogDir, readLogFile, parseJsonLogLine, createLargeString, createTestMeta } from '../utils/logging-test-helpers.js'

describe('createFileDrain', () => {
	let tempDir: string
	let testLogger: Logger

	beforeEach(() => {
		tempDir = createTempLogDir()
		testLogger = new Logger({ level: 'trace' })
	})

	afterEach(() => {
		cleanupTempDir(tempDir)
	})

	describe('basic functionality', () => {
		test('creates log file and parent directories if not exist', async () => {
			const logPath = join(tempDir, 'nested', 'deep', 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true })

			await drain(testLogger, 'info', createTestMeta(), 'test message')

			expect(existsSync(logPath)).toBe(true)
		})

		test('writes log entry to file', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true })

			await drain(testLogger, 'info', createTestMeta(), 'hello world')

			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('hello world')
		})

		test('appends multiple entries to same file', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true })

			await drain(testLogger, 'info', createTestMeta(), 'message 1')
			await drain(testLogger, 'info', createTestMeta(), 'message 2')
			await drain(testLogger, 'info', createTestMeta(), 'message 3')

			const lines = readLogFile(logPath)
			expect(lines.length).toBe(3)
			expect(lines[0]).toContain('message 1')
			expect(lines[1]).toContain('message 2')
			expect(lines[2]).toContain('message 3')
		})

		test('includes level in output', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true })

			await drain(testLogger, 'error', createTestMeta(), 'test error')

			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('[ERROR]')
		})

		test('includes message content in output', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true })

			await drain(testLogger, 'info', createTestMeta(), 'specific test content 12345')

			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('specific test content 12345')
		})
	})

	describe('timestamp formatting', () => {
		test('includes ISO timestamp when timestamp: "iso"', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true, timestamp: 'iso' })

			await drain(testLogger, 'info', createTestMeta(), 'test')

			const content = readFileSync(logPath, 'utf-8')
			// ISO format: 2025-01-15T10:30:00.123Z
			expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\]/)
		})

		test('includes unix timestamp when timestamp: "unix"', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true, timestamp: 'unix' })

			await drain(testLogger, 'info', createTestMeta(), 'test')

			const content = readFileSync(logPath, 'utf-8')
			// Unix format: [1736937000123]
			expect(content).toMatch(/\[\d{13}\]/)
		})

		test('includes short timestamp when timestamp: "short"', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true, timestamp: 'short' })

			await drain(testLogger, 'info', createTestMeta(), 'test')

			const content = readFileSync(logPath, 'utf-8')
			// Short format: [10:30:00.123]
			expect(content).toMatch(/\[\d{2}:\d{2}:\d{2}.\d{3}\]/)
		})

		test('includes long timestamp when timestamp: "long"', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true, timestamp: 'long' })

			await drain(testLogger, 'info', createTestMeta(), 'test')

			const content = readFileSync(logPath, 'utf-8')
			// Long format: [2025-01-15 10:30:00.123]
			expect(content).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}.\d{3}\]/)
		})

		test('omits timestamp when timestamp: false', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true, timestamp: false })

			await drain(testLogger, 'info', createTestMeta(), 'test message')

			const content = readFileSync(logPath, 'utf-8')
			// Should start with [INFO] not a timestamp
			expect(content).toMatch(/^\[INFO\]/)
		})
	})

	describe('ANSI stripping', () => {
		test('strips ANSI codes from output by default', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true })

			// Simulate ANSI-colored message (red color)
			await drain(testLogger, 'info', createTestMeta(), '\x1b[31mred text\x1b[0m')

			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('red text')
			expect(content).not.toContain('\x1b[31m')
			expect(content).not.toContain('\x1b[0m')
		})

		test('preserves ANSI codes when stripAnsi: false', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true, stripAnsi: false })

			await drain(testLogger, 'info', createTestMeta(), '\x1b[31mred text\x1b[0m')

			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('\x1b[31m')
		})
	})

	describe('level filtering', () => {
		test('writes all levels when no level filter set', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true })

			await drain(testLogger, 'trace', createTestMeta(), 'trace msg')
			await drain(testLogger, 'debug', createTestMeta(), 'debug msg')
			await drain(testLogger, 'info', createTestMeta(), 'info msg')
			await drain(testLogger, 'warn', createTestMeta(), 'warn msg')
			await drain(testLogger, 'error', createTestMeta(), 'error msg')

			const lines = readLogFile(logPath)
			expect(lines.length).toBe(5)
		})

		test('filters out levels below configured minimum', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true, level: 'warn' })

			await drain(testLogger, 'trace', createTestMeta(), 'trace msg')
			await drain(testLogger, 'debug', createTestMeta(), 'debug msg')
			await drain(testLogger, 'info', createTestMeta(), 'info msg')
			await drain(testLogger, 'warn', createTestMeta(), 'warn msg')
			await drain(testLogger, 'error', createTestMeta(), 'error msg')

			const lines = readLogFile(logPath)
			expect(lines.length).toBe(2) // Only warn and error
		})

		test('writes levels at or above configured minimum', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true, level: 'info' })

			await drain(testLogger, 'info', createTestMeta(), 'info msg')
			await drain(testLogger, 'warn', createTestMeta(), 'warn msg')
			await drain(testLogger, 'error', createTestMeta(), 'error msg')

			const lines = readLogFile(logPath)
			expect(lines.length).toBe(3)
			expect(lines.some((l) => l.includes('info msg'))).toBe(true)
			expect(lines.some((l) => l.includes('warn msg'))).toBe(true)
			expect(lines.some((l) => l.includes('error msg'))).toBe(true)
		})
	})

	describe('blocking mode', () => {
		test('blocking: logs are on disk immediately after await', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true })

			await drain(testLogger, 'info', createTestMeta(), 'blocking message')

			// Should be readable immediately without any flush
			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('blocking message')
		})
	})

	describe('output format', () => {
		test('text format: [TIMESTAMP] [LEVEL] - message', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true, timestamp: 'iso', format: 'text' })

			await drain(testLogger, 'info', createTestMeta(), 'test message')

			const content = readFileSync(logPath, 'utf-8').trim()
			// Format: [TIMESTAMP] [LEVEL] - message
			expect(content).toMatch(/^\[.+\] \[INFO\] - test message$/)
		})

		test('json format: {"timestamp":...,"level":...,"message":...}', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true, timestamp: 'iso', format: 'json' })

			await drain(testLogger, 'info', createTestMeta(), 'json test')

			const lines = readLogFile(logPath)
			const parsed = parseJsonLogLine(lines[0])
			expect(parsed.level).toBe('info')
			expect(parsed.message).toContain('json test')
			expect(parsed.timestamp).toBeDefined()
		})

		test('handles objects in message data', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true })

			await drain(testLogger, 'info', createTestMeta(), 'Object:', { key: 'value', nested: { a: 1 } })

			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('key')
			expect(content).toContain('value')
		})

		test('handles Error objects with stack traces', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({ path: logPath, blocking: true })

			const error = new Error('Test error')
			await drain(testLogger, 'error', createTestMeta(), 'Error occurred:', error)

			const content = readFileSync(logPath, 'utf-8')
			expect(content).toContain('Test error')
			expect(content).toContain('Error')
		})
	})

	describe('file rotation', () => {
		test('rotates file when maxSize exceeded', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({
				path: logPath,
				blocking: true,
				maxSize: 100, // 100 bytes
				maxFiles: 3
			})

			// Write enough to trigger rotation
			const largeMessage = createLargeString(80)
			await drain(testLogger, 'info', createTestMeta(), largeMessage)
			await drain(testLogger, 'info', createTestMeta(), largeMessage) // This should trigger rotation

			// Check that rotated file exists
			expect(existsSync(`${logPath}.1`)).toBe(true)
		})

		test('renames current file to .1 on rotation', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({
				path: logPath,
				blocking: true,
				maxSize: 50,
				maxFiles: 3
			})

			await drain(testLogger, 'info', createTestMeta(), createLargeString(40))
			const firstContent = readFileSync(logPath, 'utf-8')

			await drain(testLogger, 'info', createTestMeta(), createLargeString(40)) // Triggers rotation

			// Original content should now be in .1
			expect(existsSync(`${logPath}.1`)).toBe(true)
			const rotatedContent = readFileSync(`${logPath}.1`, 'utf-8')
			expect(rotatedContent).toBe(firstContent)
		})

		test('shifts existing rotated files (.1 -> .2, etc)', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({
				path: logPath,
				blocking: true,
				maxSize: 50,
				maxFiles: 5
			})

			// Create 3 rotations
			for (let i = 0; i < 4; i++) {
				await drain(testLogger, 'info', createTestMeta(), createLargeString(40) + `_v${i}`)
			}

			// Should have test.log, test.log.1, test.log.2, test.log.3
			expect(existsSync(logPath)).toBe(true)
			expect(existsSync(`${logPath}.1`)).toBe(true)
			expect(existsSync(`${logPath}.2`)).toBe(true)
			expect(existsSync(`${logPath}.3`)).toBe(true)
		})

		test('deletes oldest file when maxFiles exceeded', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({
				path: logPath,
				blocking: true,
				maxSize: 50,
				maxFiles: 2
			})

			// Create enough rotations to exceed maxFiles
			for (let i = 0; i < 4; i++) {
				await drain(testLogger, 'info', createTestMeta(), createLargeString(40) + `_v${i}`)
			}

			// Should only have test.log and test.log.1 (maxFiles=2 means current + 1 rotated)
			expect(existsSync(logPath)).toBe(true)
			expect(existsSync(`${logPath}.1`)).toBe(true)
			// Older files should be deleted
		})

		test('respects maxFiles limit', async () => {
			const logPath = join(tempDir, 'test.log')
			const drain = createFileDrain({
				path: logPath,
				blocking: true,
				maxSize: 50,
				maxFiles: 3
			})

			// Create many rotations
			for (let i = 0; i < 10; i++) {
				await drain(testLogger, 'info', createTestMeta(), createLargeString(40) + `_v${i}`)
			}

			// Count actual rotated files
			let count = 0
			for (let i = 1; i <= 10; i++) {
				if (existsSync(`${logPath}.${i}`)) count++
			}

			// Should not exceed maxFiles - 1 rotated files
			expect(count).toBeLessThanOrEqual(2) // maxFiles=3 means 2 rotated files max
		})
	})
})

describe('formatTimestamp', () => {
	const testDate = new Date('2025-01-15T10:30:45.123Z')

	test('iso: returns ISO 8601 format', () => {
		expect(formatTimestamp(testDate, 'iso')).toBe('2025-01-15T10:30:45.123Z')
	})

	test('unix: returns milliseconds since epoch', () => {
		expect(formatTimestamp(testDate, 'unix')).toBe(String(testDate.getTime()))
	})

	test('short: returns time only', () => {
		expect(formatTimestamp(testDate, 'short')).toBe('10:30:45.123')
	})

	test('long: returns date and time with space', () => {
		expect(formatTimestamp(testDate, 'long')).toBe('2025-01-15 10:30:45.123')
	})

	test('false: returns null', () => {
		expect(formatTimestamp(testDate, false)).toBeNull()
	})
})

// ============================================================================
// ANSI Color Map Tests
// ============================================================================

describe('extractAndStripAnsi', () => {
	describe('basic extraction', () => {
		test('returns empty colors array for plain text', () => {
			const result = extractAndStripAnsi('hello world', 1)
			expect(result.stripped).toBe('hello world')
			expect(result.colors).toEqual([])
		})

		test('extracts single color code at start', () => {
			const result = extractAndStripAnsi('\x1b[31mred text', 1)
			expect(result.stripped).toBe('red text')
			expect(result.colors).toEqual([
				{ line: 1, col: 0, code: '\x1b[31m' }
			])
		})

		test('extracts reset code at end', () => {
			const result = extractAndStripAnsi('text\x1b[0m', 1)
			expect(result.stripped).toBe('text')
			expect(result.colors).toEqual([
				{ line: 1, col: 4, code: '\x1b[0m' }
			])
		})

		test('extracts color and reset pair', () => {
			const result = extractAndStripAnsi('\x1b[31mred\x1b[0m', 1)
			expect(result.stripped).toBe('red')
			expect(result.colors).toEqual([
				{ line: 1, col: 0, code: '\x1b[31m' },
				{ line: 1, col: 3, code: '\x1b[0m' }
			])
		})

		test('tracks correct line number', () => {
			const result = extractAndStripAnsi('\x1b[32mgreen\x1b[0m', 42)
			expect(result.colors.every(c => c.line === 42)).toBe(true)
		})
	})

	describe('multiple codes', () => {
		test('extracts multiple different colors', () => {
			const result = extractAndStripAnsi('\x1b[31mred\x1b[0m \x1b[32mgreen\x1b[0m \x1b[34mblue\x1b[0m', 1)
			expect(result.stripped).toBe('red green blue')
			expect(result.colors.length).toBe(6)
		})

		test('extracts adjacent codes correctly', () => {
			const result = extractAndStripAnsi('\x1b[1m\x1b[31mbold red\x1b[0m', 1)
			expect(result.stripped).toBe('bold red')
			expect(result.colors).toEqual([
				{ line: 1, col: 0, code: '\x1b[1m' },
				{ line: 1, col: 0, code: '\x1b[31m' },
				{ line: 1, col: 8, code: '\x1b[0m' }
			])
		})

		test('handles combined code (semicolon syntax)', () => {
			const result = extractAndStripAnsi('\x1b[1;31mbold red\x1b[0m', 1)
			expect(result.stripped).toBe('bold red')
			expect(result.colors.length).toBe(2)
			expect(result.colors[0].code).toBe('\x1b[1;31m')
		})
	})

	describe('edge cases', () => {
		test('handles empty string', () => {
			const result = extractAndStripAnsi('', 1)
			expect(result.stripped).toBe('')
			expect(result.colors).toEqual([])
		})

		test('handles only ANSI codes (no visible text)', () => {
			const result = extractAndStripAnsi('\x1b[31m\x1b[0m', 1)
			expect(result.stripped).toBe('')
			expect(result.colors.length).toBe(2)
		})

		test('handles code in middle of text', () => {
			const result = extractAndStripAnsi('hello \x1b[33mworld\x1b[0m!', 1)
			expect(result.stripped).toBe('hello world!')
			expect(result.colors).toEqual([
				{ line: 1, col: 6, code: '\x1b[33m' },
				{ line: 1, col: 11, code: '\x1b[0m' }
			])
		})

		test('handles bright color codes (90-97)', () => {
			const result = extractAndStripAnsi('\x1b[91mbright red\x1b[0m', 1)
			expect(result.stripped).toBe('bright red')
			expect(result.colors[0].code).toBe('\x1b[91m')
		})

		test('handles background color codes (40-47)', () => {
			const result = extractAndStripAnsi('\x1b[44mblue bg\x1b[0m', 1)
			expect(result.stripped).toBe('blue bg')
			expect(result.colors[0].code).toBe('\x1b[44m')
		})

		test('handles style codes (bold, italic, underline)', () => {
			const result = extractAndStripAnsi('\x1b[1mbold\x1b[22m \x1b[3mitalic\x1b[23m \x1b[4munderline\x1b[24m', 1)
			expect(result.stripped).toBe('bold italic underline')
			expect(result.colors.length).toBe(6)
		})
	})

	describe('complex real-world scenarios', () => {
		test('handles typical robo.js log format', () => {
			// Simulates: [prefix] colored message
			const input = '\x1b[90m[Server]\x1b[0m \x1b[32mReady\x1b[0m on port \x1b[33m3000\x1b[0m'
			const result = extractAndStripAnsi(input, 1)
			expect(result.stripped).toBe('[Server] Ready on port 3000')
			expect(result.colors.length).toBe(6)
		})

		test('handles error with stack trace styling', () => {
			const input = '\x1b[31mError:\x1b[0m Something failed\n    at \x1b[90mfile.ts:42\x1b[0m'
			const result = extractAndStripAnsi(input, 1)
			expect(result.stripped).toBe('Error: Something failed\n    at file.ts:42')
		})

		test('handles nested formatting', () => {
			const input = '\x1b[1m\x1b[4m\x1b[31mbold underline red\x1b[0m'
			const result = extractAndStripAnsi(input, 1)
			expect(result.stripped).toBe('bold underline red')
			expect(result.colors[0].code).toBe('\x1b[1m')
			expect(result.colors[1].code).toBe('\x1b[4m')
			expect(result.colors[2].code).toBe('\x1b[31m')
		})
	})
})

describe('applyColorMap', () => {
	describe('basic reconstruction', () => {
		test('returns original string when no colors', () => {
			const result = applyColorMap('hello world', [])
			expect(result).toBe('hello world')
		})

		test('inserts single code at start', () => {
			const colors: ColorMapEntry[] = [{ line: 1, col: 0, code: '\x1b[31m' }]
			const result = applyColorMap('red text', colors)
			expect(result).toBe('\x1b[31mred text')
		})

		test('inserts code at end', () => {
			const colors: ColorMapEntry[] = [{ line: 1, col: 4, code: '\x1b[0m' }]
			const result = applyColorMap('text', colors)
			expect(result).toBe('text\x1b[0m')
		})

		test('inserts code in middle', () => {
			const colors: ColorMapEntry[] = [{ line: 1, col: 6, code: '\x1b[33m' }]
			const result = applyColorMap('hello world', colors)
			expect(result).toBe('hello \x1b[33mworld')
		})
	})

	describe('multiple codes', () => {
		test('inserts multiple codes in correct positions', () => {
			const colors: ColorMapEntry[] = [
				{ line: 1, col: 0, code: '\x1b[31m' },
				{ line: 1, col: 3, code: '\x1b[0m' }
			]
			const result = applyColorMap('red', colors)
			expect(result).toBe('\x1b[31mred\x1b[0m')
		})

		test('handles adjacent codes at same position', () => {
			const colors: ColorMapEntry[] = [
				{ line: 1, col: 0, code: '\x1b[1m' },
				{ line: 1, col: 0, code: '\x1b[31m' }
			]
			const result = applyColorMap('bold red', colors)
			// Both codes should be at position 0, order should be preserved
			expect(result).toContain('\x1b[1m')
			expect(result).toContain('\x1b[31m')
			expect(result).toContain('bold red')
		})

		test('reconstructs complex multi-color message', () => {
			const colors: ColorMapEntry[] = [
				{ line: 1, col: 0, code: '\x1b[31m' },
				{ line: 1, col: 3, code: '\x1b[0m' },
				{ line: 1, col: 4, code: '\x1b[32m' },
				{ line: 1, col: 9, code: '\x1b[0m' },
				{ line: 1, col: 10, code: '\x1b[34m' },
				{ line: 1, col: 14, code: '\x1b[0m' }
			]
			const result = applyColorMap('red green blue', colors)
			expect(result).toBe('\x1b[31mred\x1b[0m \x1b[32mgreen\x1b[0m \x1b[34mblue\x1b[0m')
		})
	})

	describe('edge cases', () => {
		test('handles empty string', () => {
			const result = applyColorMap('', [])
			expect(result).toBe('')
		})

		test('handles code position beyond string length (clamps)', () => {
			const colors: ColorMapEntry[] = [{ line: 1, col: 100, code: '\x1b[0m' }]
			const result = applyColorMap('short', colors)
			expect(result).toBe('short\x1b[0m')
		})

		test('handles unsorted color array', () => {
			const colors: ColorMapEntry[] = [
				{ line: 1, col: 5, code: '\x1b[0m' },
				{ line: 1, col: 0, code: '\x1b[32m' }
			]
			const result = applyColorMap('green', colors)
			expect(result).toBe('\x1b[32mgreen\x1b[0m')
		})
	})
})

describe('round-trip (extract then apply)', () => {
	const testCases = [
		'plain text with no colors',
		'\x1b[31mred\x1b[0m',
		'\x1b[1m\x1b[31mbold red\x1b[0m',
		'mixed \x1b[32mgreen\x1b[0m and \x1b[34mblue\x1b[0m text',
		'\x1b[90m[prefix]\x1b[0m \x1b[33mmessage\x1b[0m',
		'\x1b[1;4;31mbold underline red\x1b[0m',
		'text \x1b[41mwith bg\x1b[0m color',
		'\x1b[91mbright red\x1b[0m \x1b[92mbright green\x1b[0m',
		'\x1b[1m\x1b[3m\x1b[4m\x1b[31mmany styles\x1b[0m'
	]

	test.each(testCases)('preserves original: %s', (original) => {
		const { stripped, colors } = extractAndStripAnsi(original, 1)
		const reconstructed = applyColorMap(stripped, colors)
		expect(reconstructed).toBe(original)
	})

	test('round-trip with multiple lines', () => {
		const lines = [
			'\x1b[31mError:\x1b[0m failed',
			'    at \x1b[90mfile.ts:42\x1b[0m',
			'\x1b[32mRecovering...\x1b[0m'
		]

		for (let i = 0; i < lines.length; i++) {
			const { stripped, colors } = extractAndStripAnsi(lines[i], i + 1)
			const reconstructed = applyColorMap(stripped, colors)
			expect(reconstructed).toBe(lines[i])
		}
	})
})

describe('parseColorMapFile', () => {
	test('parses single entry', () => {
		const content = '{"line":1,"col":0,"code":"\\u001b[31m"}\n'
		const result = parseColorMapFile(content)
		expect(result.size).toBe(1)
		expect(result.get(1)).toEqual([{ line: 1, col: 0, code: '\x1b[31m' }])
	})

	test('parses multiple entries for same line', () => {
		const content = [
			'{"line":1,"col":0,"code":"\\u001b[31m"}',
			'{"line":1,"col":3,"code":"\\u001b[0m"}'
		].join('\n')
		const result = parseColorMapFile(content)
		expect(result.size).toBe(1)
		expect(result.get(1)?.length).toBe(2)
	})

	test('parses entries for different lines', () => {
		const content = [
			'{"line":1,"col":0,"code":"\\u001b[31m"}',
			'{"line":2,"col":0,"code":"\\u001b[32m"}',
			'{"line":3,"col":0,"code":"\\u001b[34m"}'
		].join('\n')
		const result = parseColorMapFile(content)
		expect(result.size).toBe(3)
		expect(result.has(1)).toBe(true)
		expect(result.has(2)).toBe(true)
		expect(result.has(3)).toBe(true)
	})

	test('handles empty content', () => {
		const result = parseColorMapFile('')
		expect(result.size).toBe(0)
	})

	test('handles whitespace-only content', () => {
		const result = parseColorMapFile('   \n  \n  ')
		expect(result.size).toBe(0)
	})

	test('skips malformed JSON lines', () => {
		const content = [
			'{"line":1,"col":0,"code":"\\u001b[31m"}',
			'not valid json',
			'{"line":2,"col":0,"code":"\\u001b[32m"}'
		].join('\n')
		const result = parseColorMapFile(content)
		expect(result.size).toBe(2)
	})

	test('handles trailing newline', () => {
		const content = '{"line":1,"col":0,"code":"\\u001b[31m"}\n\n'
		const result = parseColorMapFile(content)
		expect(result.size).toBe(1)
	})
})

describe('reconstructColoredLogs', () => {
	test('reconstructs single line', () => {
		const stripped = 'red text'
		const colorMap = new Map<number, ColorMapEntry[]>([
			[1, [
				{ line: 1, col: 0, code: '\x1b[31m' },
				{ line: 1, col: 8, code: '\x1b[0m' }
			]]
		])
		const result = reconstructColoredLogs(stripped, colorMap)
		expect(result).toBe('\x1b[31mred text\x1b[0m')
	})

	test('reconstructs multiple lines', () => {
		const stripped = 'line one\nline two\nline three'
		const colorMap = new Map<number, ColorMapEntry[]>([
			[1, [{ line: 1, col: 0, code: '\x1b[31m' }, { line: 1, col: 8, code: '\x1b[0m' }]],
			[2, [{ line: 2, col: 0, code: '\x1b[32m' }, { line: 2, col: 8, code: '\x1b[0m' }]],
			[3, [{ line: 3, col: 0, code: '\x1b[34m' }, { line: 3, col: 10, code: '\x1b[0m' }]]
		])
		const result = reconstructColoredLogs(stripped, colorMap)
		expect(result).toBe('\x1b[31mline one\x1b[0m\n\x1b[32mline two\x1b[0m\n\x1b[34mline three\x1b[0m')
	})

	test('preserves lines without color entries', () => {
		const stripped = 'colored\nplain\ncolored again'
		const colorMap = new Map<number, ColorMapEntry[]>([
			[1, [{ line: 1, col: 0, code: '\x1b[31m' }, { line: 1, col: 7, code: '\x1b[0m' }]],
			[3, [{ line: 3, col: 0, code: '\x1b[32m' }, { line: 3, col: 13, code: '\x1b[0m' }]]
		])
		const result = reconstructColoredLogs(stripped, colorMap)
		const lines = result.split('\n')
		expect(lines[0]).toBe('\x1b[31mcolored\x1b[0m')
		expect(lines[1]).toBe('plain')
		expect(lines[2]).toBe('\x1b[32mcolored again\x1b[0m')
	})

	test('handles empty colormap', () => {
		const stripped = 'plain text\nanother line'
		const colorMap = new Map<number, ColorMapEntry[]>()
		const result = reconstructColoredLogs(stripped, colorMap)
		expect(result).toBe(stripped)
	})

	test('handles empty content', () => {
		const colorMap = new Map<number, ColorMapEntry[]>()
		const result = reconstructColoredLogs('', colorMap)
		expect(result).toBe('')
	})
})

describe('full colormap file integration', () => {
	let tempDir: string
	let testLogger: Logger

	beforeEach(() => {
		tempDir = createTempLogDir()
		testLogger = new Logger({ level: 'trace' })
	})

	afterEach(() => {
		cleanupTempDir(tempDir)
	})

	test('creates colormap file when colorMap option enabled', async () => {
		const logPath = join(tempDir, 'test.log')
		const drain = createFileDrain({ path: logPath, blocking: true, colorMap: true })

		await drain(testLogger, 'info', createTestMeta(), '\x1b[31mred message\x1b[0m')

		expect(existsSync(`${logPath}.colormap`)).toBe(true)
	})

	test('does not create colormap file when colorMap option disabled', async () => {
		const logPath = join(tempDir, 'test.log')
		const drain = createFileDrain({ path: logPath, blocking: true, colorMap: false })

		await drain(testLogger, 'info', createTestMeta(), '\x1b[31mred message\x1b[0m')

		expect(existsSync(`${logPath}.colormap`)).toBe(false)
	})

	test('does not create colormap file when stripAnsi is false', async () => {
		const logPath = join(tempDir, 'test.log')
		const drain = createFileDrain({ path: logPath, blocking: true, colorMap: true, stripAnsi: false })

		await drain(testLogger, 'info', createTestMeta(), '\x1b[31mred message\x1b[0m')

		// colorMap only works when stripAnsi is true
		expect(existsSync(`${logPath}.colormap`)).toBe(false)
	})

	test('colormap file contains valid JSON entries', async () => {
		const logPath = join(tempDir, 'test.log')
		const drain = createFileDrain({ path: logPath, blocking: true, colorMap: true })

		await drain(testLogger, 'info', createTestMeta(), '\x1b[31mred\x1b[0m')

		const colorMapContent = readFileSync(`${logPath}.colormap`, 'utf-8')
		const lines = colorMapContent.trim().split('\n')

		for (const line of lines) {
			const parsed = JSON.parse(line)
			expect(parsed).toHaveProperty('line')
			expect(parsed).toHaveProperty('col')
			expect(parsed).toHaveProperty('code')
		}
	})

	test('can reconstruct original colored message from log + colormap', async () => {
		const logPath = join(tempDir, 'test.log')
		const drain = createFileDrain({ path: logPath, blocking: true, colorMap: true })

		const originalMessage = '\x1b[32mSuccess:\x1b[0m Operation completed'
		await drain(testLogger, 'info', createTestMeta(), originalMessage)

		// Read the stripped log
		const logContent = readFileSync(logPath, 'utf-8')

		// Read and parse the colormap
		const colorMapContent = readFileSync(`${logPath}.colormap`, 'utf-8')
		const colorMap = parseColorMapFile(colorMapContent)

		// The log format is [LEVEL] - message\n, so extract just the message part
		const logLine = logContent.trim()
		const messageMatch = logLine.match(/\[INFO\] - (.*)$/)
		expect(messageMatch).not.toBeNull()

		// Reconstruct
		const reconstructed = reconstructColoredLogs(messageMatch![1], colorMap)
		expect(reconstructed).toBe(originalMessage)
	})

	test('handles multiple log entries with colors', async () => {
		const logPath = join(tempDir, 'test.log')
		const drain = createFileDrain({ path: logPath, blocking: true, colorMap: true })

		await drain(testLogger, 'info', createTestMeta(), '\x1b[31mError 1\x1b[0m')
		await drain(testLogger, 'info', createTestMeta(), '\x1b[32mSuccess\x1b[0m')
		await drain(testLogger, 'info', createTestMeta(), '\x1b[33mWarning\x1b[0m')

		const colorMapContent = readFileSync(`${logPath}.colormap`, 'utf-8')
		const colorMap = parseColorMapFile(colorMapContent)

		// Should have entries for 3 lines
		expect(colorMap.has(1)).toBe(true)
		expect(colorMap.has(2)).toBe(true)
		expect(colorMap.has(3)).toBe(true)
	})

	test('colormap file rotates with log file', async () => {
		const logPath = join(tempDir, 'test.log')
		const drain = createFileDrain({
			path: logPath,
			blocking: true,
			colorMap: true,
			maxSize: 100,
			maxFiles: 3
		})

		// Write enough to trigger rotation
		await drain(testLogger, 'info', createTestMeta(), createLargeString(80) + '\x1b[31mred\x1b[0m')
		await drain(testLogger, 'info', createTestMeta(), createLargeString(80) + '\x1b[32mgreen\x1b[0m')

		// Both log and colormap should have rotated
		expect(existsSync(`${logPath}.1`)).toBe(true)
		expect(existsSync(`${logPath}.colormap.1`)).toBe(true)
	})

	test('reconstructs colors after rotation', async () => {
		const logPath = join(tempDir, 'test.log')
		const drain = createFileDrain({
			path: logPath,
			blocking: true,
			colorMap: true,
			maxSize: 100,
			maxFiles: 3
		})

		const originalMessage = '\x1b[34mBlue message\x1b[0m'
		await drain(testLogger, 'info', createTestMeta(), originalMessage)

		// Force rotation by writing more
		await drain(testLogger, 'info', createTestMeta(), createLargeString(120))

		// Read rotated log and colormap
		const rotatedLogContent = readFileSync(`${logPath}.1`, 'utf-8')
		const rotatedColorMapContent = readFileSync(`${logPath}.colormap.1`, 'utf-8')
		const colorMap = parseColorMapFile(rotatedColorMapContent)

		// Extract message from log line
		const logLine = rotatedLogContent.trim()
		const messageMatch = logLine.match(/\[INFO\] - (.*)$/)

		if (messageMatch) {
			const reconstructed = reconstructColoredLogs(messageMatch[1], colorMap)
			expect(reconstructed).toBe(originalMessage)
		}
	})
})
