import type { RoboRequest } from '@robojs/server'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { badRequest } from '../utils.js'

/**
 * GET /api/control/tests/logs - List available test logs or get a specific log
 *
 * Query parameters:
 * - file: Log file name (e.g., "ping.log") - if provided, returns the log content
 *
 * Response (no file param - list logs):
 * {
 *   logs: Array<{ name: string, path: string, size: number }>
 * }
 *
 * Response (with file param - get log content):
 * {
 *   name: string,
 *   path: string,
 *   content: string,
 *   exists: boolean
 * }
 */

function getLogsDir(): string {
	return join(process.cwd(), '.robo', 'logs', 'tests')
}

export async function GET(request: RoboRequest) {
	const url = new URL(request.url)
	const file = url.searchParams.get('file')
	const logsDir = getLogsDir()

	// If file param provided, return specific log content
	if (file) {
		// Sanitize filename to prevent path traversal
		const sanitizedFile = basename(file)
		if (sanitizedFile !== file) {
			return badRequest('Invalid file name')
		}

		const logPath = join(logsDir, sanitizedFile)
		const exists = existsSync(logPath)

		if (!exists) {
			return {
				name: sanitizedFile,
				path: logPath,
				content: '',
				exists: false
			}
		}

		try {
			const content = readFileSync(logPath, 'utf-8')
			return {
				name: sanitizedFile,
				path: logPath,
				content,
				exists: true
			}
		} catch (error) {
			return {
				name: sanitizedFile,
				path: logPath,
				content: '',
				exists: false,
				error: (error as Error).message
			}
		}
	}

	// No file param - list all logs
	if (!existsSync(logsDir)) {
		return { logs: [] }
	}

	try {
		const files = readdirSync(logsDir, { withFileTypes: true })
		const logs = files
			.filter((f) => f.isFile() && f.name.endsWith('.log'))
			.map((f) => {
				const fullPath = join(logsDir, f.name)
				let size = 0
				try {
					const stat = require('node:fs').statSync(fullPath)
					size = stat.size
				} catch {
					// Ignore stat errors
				}
				return {
					name: f.name,
					path: fullPath,
					size
				}
			})
			.sort((a, b) => a.name.localeCompare(b.name))

		return { logs }
	} catch {
		return { logs: [] }
	}
}
