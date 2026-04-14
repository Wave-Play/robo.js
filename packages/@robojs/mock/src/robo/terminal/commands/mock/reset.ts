/**
 * /mock reset - Reset mock session state.
 *
 * Clears session state, recorded actions, and voice servers
 * while preserving the bot user identity.
 */
import { getSelectedSessionId, resolveTargetSession } from '../../session-target.js'
import { sessionManager } from '../../../../core/manager.js'
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Reset mock session state'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const session = resolveTargetSession()
	if (!session) {
		ctx.write('No active mock session\n')
		ctx.write('Start with: robo dev --mock\n')
		return
	}

	session.reset()
	ctx.write('Session state reset\n')
	ctx.write('Cleared: entities, actions, voice servers\n')
	ctx.write('Preserved: bot user, connections\n')

	// Multi-session hint when no explicit selection and multiple sessions exist
	if (sessionManager.size > 1 && !getSelectedSessionId()) {
		ctx.write(`Tip: ${sessionManager.size} sessions active. Use /mock sessions to list.\n`)
	}
}
