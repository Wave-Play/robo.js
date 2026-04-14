/**
 * /mock status - Show mock session dashboard.
 *
 * Displays the current mock session state including
 * session info, entity counts, and feature toggles.
 */
import { getSelectedSessionId, resolveTargetSession } from '../../session-target.js'
import { sessionManager } from '../../../../core/manager.js'
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Show mock session dashboard'
} as const)

function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp
	const seconds = Math.floor(diff / 1000)
	const minutes = Math.floor(seconds / 60)
	const hours = Math.floor(minutes / 60)

	if (hours > 0) {
		return `${hours}h ${minutes % 60}m ago`
	}
	if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s ago`
	}
	return `${seconds}s ago`
}

export default async function (ctx: TerminalContext<typeof config>) {
	const session = resolveTargetSession()
	if (!session) {
		ctx.write('No active mock session\n')
		ctx.write('Start with: robo dev --mock\n')
		return
	}

	ctx.write('Mock Session Status\n')
	ctx.write('\n')
	ctx.write(`  Session ID:   ${session.id}\n`)
	if (session.name) {
		ctx.write(`  Name:         ${session.name}\n`)
	}
	ctx.write(`  Created:      ${formatRelativeTime(session.createdAt)}\n`)
	ctx.write(`  Bot User:     ${session.state.botUser.username}\n`)
	ctx.write(`  Connections:  ${session.connections.size}\n`)
	ctx.write(`  Sessions:     ${sessionManager.size}\n`)
	ctx.write('\n')

	ctx.write('  Entities:\n')
	ctx.write(`    Guilds:     ${session.state.guilds.size}\n`)
	ctx.write(`    Channels:   ${session.state.channels.size}\n`)
	ctx.write(`    Users:      ${session.state.users.size}\n`)
	ctx.write(`    Messages:   ${session.state.messages.size}\n`)
	ctx.write(`    Commands:   ${session.state.commands.size}\n`)
	ctx.write(`    Roles:      ${session.state.roles.size}\n`)
	ctx.write('\n')

	const actions = session.getActions()
	ctx.write(`  Actions:      ${actions.length}\n`)
	ctx.write('\n')

	ctx.write('  Features:\n')
	ctx.write(`    Rate Limit Sim:       ${session.isRateLimitSimulationActive ? 'on' : 'off'}\n`)
	ctx.write(`    Loop Protection:      ${session.loopProtectionEnabled ? 'on' : 'off'}\n`)
	ctx.write('\n')

	// Multi-session hint when no explicit selection and multiple sessions exist
	if (sessionManager.size > 1 && !getSelectedSessionId()) {
		ctx.write(`Tip: ${sessionManager.size} sessions active. Use /mock sessions to list.\n`)
	}
}
