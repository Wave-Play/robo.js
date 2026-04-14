/**
 * /mock actions - List recorded bot actions.
 *
 * Displays actions recorded during the mock session
 * with optional type filtering and clearing.
 */
import { getSelectedSessionId, resolveTargetSession } from '../../session-target.js'
import { sessionManager } from '../../../../core/manager.js'
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'
import type { RecordedAction, ActionType } from '../../../../types/index.js'

export const config = createTerminalCommandConfig({
	description: 'List recorded bot actions',
	options: [
		{
			alias: '-t',
			name: '--type',
			description: 'Filter by action type',
			type: 'string'
		},
		{
			alias: '-l',
			name: '--limit',
			description: 'Max items to show',
			type: 'number'
		},
		{
			alias: '-c',
			name: '--clear',
			description: 'Clear all recorded actions',
			type: 'boolean'
		}
	]
} as const)

function formatRelativeTime(timestamp: number): string {
	const diff = Date.now() - timestamp
	const seconds = Math.floor(diff / 1000)
	const minutes = Math.floor(seconds / 60)

	if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s ago`
	}
	return `${seconds}s ago`
}

function summarizeAction(action: RecordedAction): string {
	const data = action.data as Record<string, unknown> | undefined

	switch (action.type) {
		case 'message_sent':
			return truncate((data?.content as string) ?? 'Message sent', 40)
		case 'rest_request':
			return `${action.method ?? 'GET'} ${action.endpoint ?? ''}`.trim()
		case 'dispatch':
			return truncate((data?.t as string) ?? 'Event dispatched', 40)
		case 'interaction_response':
			return `Type ${action.responseType ?? '?'} response`
		case 'interaction_followup':
			return 'Follow-up message'
		case 'gateway_identify':
			return 'Bot identified'
		case 'gateway_heartbeat':
			return 'Heartbeat'
		default:
			return action.type
	}
}

function truncate(str: string, max: number): string {
	return str.length > max ? str.slice(0, max - 3) + '...' : str
}

export default async function (ctx: TerminalContext<typeof config>) {
	const session = resolveTargetSession()
	if (!session) {
		ctx.write('No active mock session\n')
		ctx.write('Start with: robo dev --mock\n')
		return
	}

	// Handle --clear
	if (ctx.options.clear) {
		session.clearActions()
		ctx.write('Actions cleared\n')
		return
	}

	// Get actions, optionally filtered by type
	const typeFilter = ctx.options.type
	let actions: RecordedAction[]
	if (typeFilter) {
		actions = session.getActionsByType(typeFilter as ActionType)
	} else {
		actions = session.getActions()
	}

	if (actions.length === 0) {
		ctx.write(typeFilter ? `No actions of type "${typeFilter}"\n` : 'No actions recorded\n')
		return
	}

	// Slice to last N items (most recent)
	const limit = ctx.options.limit ?? 15
	const display = actions.slice(-limit)

	// Calculate column widths
	const timeWidth = Math.max(4, ...display.map((a) => formatRelativeTime(a.timestamp).length))
	const typeWidth = Math.max(4, ...display.map((a) => a.type.length))

	ctx.write(`Recorded Actions${typeFilter ? ` (type: ${typeFilter})` : ''}\n\n`)
	ctx.write(`${'TIME'.padEnd(timeWidth)}  ${'TYPE'.padEnd(typeWidth)}  SUMMARY\n`)
	ctx.write('\u2500'.repeat(timeWidth + typeWidth + 46) + '\n')

	for (const action of display) {
		const time = formatRelativeTime(action.timestamp).padEnd(timeWidth)
		const type = action.type.padEnd(typeWidth)
		const summary = summarizeAction(action)
		ctx.write(`${time}  ${type}  ${summary}\n`)
	}

	ctx.write(`\nShowing ${display.length} of ${actions.length} actions\n`)

	// Multi-session hint when no explicit selection and multiple sessions exist
	if (sessionManager.size > 1 && !getSelectedSessionId()) {
		ctx.write(`Tip: ${sessionManager.size} sessions active. Use /mock sessions to list.\n`)
	}
}
