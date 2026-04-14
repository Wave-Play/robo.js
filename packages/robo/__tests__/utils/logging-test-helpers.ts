import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { LogDrain, LogMetadata, Logger } from '../../src/core/logger.js'

/**
 * Creates a temporary directory for test log files.
 */
export function createTempLogDir(): string {
	return mkdtempSync(join(tmpdir(), 'robo-log-test-'))
}

/**
 * Removes a temporary directory and all its contents.
 */
export function cleanupTempDir(dir: string): void {
	rmSync(dir, { recursive: true, force: true })
}

/**
 * Reads a log file and returns its lines as an array.
 */
export function readLogFile(filePath: string): string[] {
	return readFileSync(filePath, 'utf-8').split('\n').filter(Boolean)
}

/**
 * Parses a JSON log line.
 */
export function parseJsonLogLine(line: string): { timestamp: string; level: string; message: string; source?: string; sessionId?: string; pid?: number } {
	return JSON.parse(line)
}

/**
 * Creates a LogMetadata object for tests.
 */
export function createTestMeta(overrides?: Partial<LogMetadata>): LogMetadata {
	return {
		source: null,
		timestamp: new Date(),
		sessionId: null,
		pid: process.pid,
		...overrides
	}
}

/**
 * Creates a mock drain that captures all log calls.
 */
export function createMockDrain(): { drain: LogDrain; calls: Array<{ level: string; meta: LogMetadata; data: unknown[] }> } {
	const calls: Array<{ level: string; meta: LogMetadata; data: unknown[] }> = []
	const drain: LogDrain = async (_logger: Logger, level: string, meta: LogMetadata, ...data: unknown[]) => {
		calls.push({ level, meta, data })
	}
	return { drain, calls }
}

/**
 * Creates a mock drain that delays by a specified amount.
 */
export function createDelayedMockDrain(
	delayMs: number
): { drain: LogDrain; calls: Array<{ level: string; meta: LogMetadata; data: unknown[] }> } {
	const calls: Array<{ level: string; meta: LogMetadata; data: unknown[] }> = []
	const drain: LogDrain = async (_logger: Logger, level: string, meta: LogMetadata, ...data: unknown[]) => {
		await new Promise((resolve) => setTimeout(resolve, delayMs))
		calls.push({ level, meta, data })
	}
	return { drain, calls }
}

/**
 * Waits for a file to exist on disk.
 */
export async function waitForFile(filePath: string, timeout = 1000): Promise<void> {
	const { existsSync } = await import('node:fs')
	const start = Date.now()
	while (!existsSync(filePath)) {
		if (Date.now() - start > timeout) {
			throw new Error(`File ${filePath} not created within ${timeout}ms`)
		}
		await new Promise((r) => setTimeout(r, 10))
	}
}

/**
 * Creates a string of specified length.
 */
export function createLargeString(sizeInBytes: number): string {
	return 'x'.repeat(sizeInBytes)
}

/**
 * Creates a temporary .robo/logs directory structure for testing auto file logging.
 */
export function createTempRoboLogsDir(): { baseDir: string; logsDir: string } {
	const baseDir = createTempLogDir()
	const logsDir = join(baseDir, '.robo', 'logs')
	mkdirSync(logsDir, { recursive: true })
	return { baseDir, logsDir }
}

/**
 * Waits for a log file to have content (non-empty).
 */
export async function waitForLogContent(filePath: string, timeout = 5000): Promise<string> {
	const start = Date.now()
	while (Date.now() - start < timeout) {
		if (existsSync(filePath)) {
			const content = readFileSync(filePath, 'utf-8')
			if (content.length > 0) {
				return content
			}
		}
		await new Promise((r) => setTimeout(r, 100))
	}
	throw new Error(`Log file ${filePath} did not receive content within ${timeout}ms`)
}

/**
 * Simulates the auto file logging configuration logic from robo.ts.
 * Returns whether an auto file drain should be created based on config and mode.
 */
export function shouldCreateAutoFileDrain(
	config: { logger?: { files?: unknown[] } } | null | undefined,
	isMockTestMode: boolean
): boolean {
	// Auto-create if files is undefined (not explicitly empty) and not in mock test mode
	return config?.logger?.files === undefined && !isMockTestMode
}

/**
 * Generates the expected auto log file path for a given mode.
 */
export function getAutoLogPath(mode: string | null | undefined): string {
	const logMode = mode || 'default'
	return `.robo/logs/${logMode}.log`
}
