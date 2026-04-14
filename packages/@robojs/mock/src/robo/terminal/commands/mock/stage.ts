/**
 * /mock stage - Open the Stage UI in your browser.
 *
 * Opens the mock Stage UI for visual testing and DevTools.
 */
import { getSelectedSessionId, resolveTargetSession } from '../../session-target.js'
import { sessionManager } from '../../../../core/manager.js'
import { getStageUIUrl } from '../../../../utils/server.js'
import { execFile } from 'node:child_process'
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Open the Stage UI in your browser'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const session = resolveTargetSession()
	if (!session) {
		ctx.write('No active mock session\n')
		ctx.write('Start with: robo dev --mock\n')
		return
	}

	const url = getStageUIUrl(session.token)

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

	// Multi-session hint when no explicit selection and multiple sessions exist
	if (sessionManager.size > 1 && !getSelectedSessionId()) {
		ctx.write(`Tip: ${sessionManager.size} sessions active. Use /mock sessions to list.\n`)
	}
}
