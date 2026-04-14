/**
 * /mock sessions - List all active sessions.
 *
 * Displays a table of active sessions with a marker
 * on the currently targeted one.
 */
import { getMockModeSession } from '../../../start.js'
import { getSelectedSessionId, resolveTargetSession } from '../../session-target.js'
import { sessionManager } from '../../../../core/manager.js'
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'List all active sessions'
} as const)

function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp
	const seconds = Math.floor(diff / 1000)
	const minutes = Math.floor(seconds / 60)
	const hours = Math.floor(minutes / 60)

	if (hours > 0) {
		return `${hours}h ago`
	}
	if (minutes > 0) {
		return `${minutes}m ago`
	}
	return `${seconds}s ago`
}

export default async function (ctx: TerminalContext<typeof config>) {
	const sessions = sessionManager.getAll()

	if (sessions.length === 0) {
		ctx.write('No active sessions\n')
		ctx.write('Start with: robo dev --mock\n')
		return
	}

	// Determine which session is the current target
	const target = resolveTargetSession()
	const targetId = target?.id ?? null

	ctx.write(`Active Sessions (${sessions.length})\n\n`)

	// Column headers
	const idWidth = Math.max(2, ...sessions.map((s) => s.id.length))
	const nameWidth = Math.max(4, ...sessions.map((s) => (s.name ?? '-').length))

	ctx.write(`  ${'ID'.padEnd(idWidth)}  ${'NAME'.padEnd(nameWidth)}  ${'CREATED'.padEnd(8)}  ${'CONNS'.padEnd(5)}  ${'GUILDS'.padEnd(6)}  ACTIONS\n`)
	ctx.write('  ' + '\u2500'.repeat(idWidth + nameWidth + 40) + '\n')

	for (const session of sessions) {
		const marker = session.id === targetId ? '> ' : '  '
		const id = session.id.padEnd(idWidth)
		const name = (session.name ?? '-').padEnd(nameWidth)
		const created = formatRelativeTime(session.createdAt).padEnd(8)
		const conns = String(session.connections.size).padEnd(5)
		const guilds = String(session.state.guilds.size).padEnd(6)
		const actions = String(session.getActions().length)

		ctx.write(`${marker}${id}  ${name}  ${created}  ${conns}  ${guilds}  ${actions}\n`)
	}

	ctx.write('\n')

	// Show hint about selected session
	const selectedId = getSelectedSessionId()
	const devSession = getMockModeSession()
	if (selectedId) {
		ctx.write(`Target: ${selectedId} (via /mock use)\n`)
	} else if (devSession) {
		ctx.write(`Target: ${devSession.id} (dev session)\n`)
	}

	ctx.write('Use /mock use <id> to switch sessions.\n')
}
