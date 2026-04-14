/**
 * /open - Open the dev server URL in the default browser.
 */
import { createTerminalCommandConfig } from 'robo.js'
import { execFile } from 'node:child_process'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Open the dev server in your browser'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const url = getDevUrl()
	if (!url) {
		ctx.write('No server URL available.\n')
		return
	}

	// Platform-aware open command (use execFile to avoid shell injection)
	if (process.platform === 'win32') {
		execFile('cmd', ['/c', 'start', '', url], (error) => {
			if (error) ctx.write(`Failed to open browser: ${error.message}\n`)
		})
	} else {
		const command = process.platform === 'darwin' ? 'open' : 'xdg-open'
		execFile(command, [url], (error) => {
			if (error) ctx.write(`Failed to open browser: ${error.message}\n`)
		})
	}
	ctx.write(`Opening ${url}\n`)
}

function getDevUrl(): string | null {
	const server = (globalThis as Record<string, unknown>).roboServer as
		| { hostname?: string; port?: number; ready?: boolean }
		| undefined

	if (server?.ready) {
		const hostname = server.hostname ?? 'localhost'
		const port = server.port ?? 3000
		return `http://${hostname}:${port}`
	}

	return null
}
