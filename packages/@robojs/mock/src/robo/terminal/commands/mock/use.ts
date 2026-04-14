/**
 * /mock use - Switch the targeted session.
 *
 * Changes which session subsequent /mock commands operate on.
 * With no arguments, shows the current target.
 */
import { getMockModeSession } from '../../../start.js'
import { getSelectedSessionId, setSelectedSessionId } from '../../session-target.js'
import { sessionManager } from '../../../../core/manager.js'
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Switch target session',
	positionalArgs: true,
	options: [
		{
			name: '--reset',
			description: 'Clear selection, revert to dev session',
			type: 'boolean'
		}
	]
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	// Handle --reset: clear selection
	if (ctx.options.reset) {
		setSelectedSessionId(null)
		const devSession = getMockModeSession()
		if (devSession) {
			ctx.write(`Reverted to dev session: ${devSession.id}\n`)
		} else {
			ctx.write('Selection cleared\n')
		}
		return
	}

	const targetId = ctx.args[0]

	// No arguments: show current target
	if (!targetId) {
		const selectedId = getSelectedSessionId()
		if (selectedId) {
			const session = sessionManager.get(selectedId)
			if (session) {
				ctx.write(`Current target: ${session.id}${session.name ? ` (${session.name})` : ''}\n`)
			} else {
				ctx.write(`Selected session ${selectedId} no longer exists\n`)
				setSelectedSessionId(null)
				const devSession = getMockModeSession()
				if (devSession) {
					ctx.write(`Reverted to dev session: ${devSession.id}\n`)
				}
			}
		} else {
			const devSession = getMockModeSession()
			if (devSession) {
				ctx.write(`Current target: ${devSession.id} (dev session)\n`)
			} else {
				ctx.write('No active session\n')
			}
		}
		ctx.write('\nUsage: /mock use <session-id>\n')
		return
	}

	// Look up the session
	const session = sessionManager.get(targetId)
	if (!session) {
		ctx.write(`Session not found: ${targetId}\n`)
		ctx.write('Use /mock sessions to list active sessions.\n')
		return
	}

	setSelectedSessionId(session.id)
	ctx.write(`Switched to: ${session.id}${session.name ? ` (${session.name})` : ''}\n`)
}
