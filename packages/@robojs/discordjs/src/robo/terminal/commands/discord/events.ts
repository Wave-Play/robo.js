/**
 * /discord events - List event listeners.
 *
 * Displays registered event handlers grouped by event name,
 * with handler counts and required intents for each event.
 */
import { REQUIRED_INTENTS, getIntentNames } from '../../../../core/intents.js'
import { createTerminalCommandConfig, Manifest } from 'robo.js'
import { GatewayIntentBits } from 'discord.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'List event listeners',
	options: [
		{
			alias: '-p',
			name: '--page',
			description: 'Page number',
			type: 'number'
		},
		{
			alias: '-n',
			name: '--per-page',
			description: 'Items per page',
			type: 'number'
		}
	]
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const page = ctx.options.page ?? 1
	const perPage = ctx.options['per-page'] ?? 15

	const summaries = await Manifest.routeSummaries('discordjs', 'events')

	if (summaries.length === 0) {
		ctx.write('No event listeners registered\n')
		return
	}

	// Group handlers by event key
	const eventGroups = new Map<string, number>()
	for (const summary of summaries) {
		eventGroups.set(summary.key, (eventGroups.get(summary.key) ?? 0) + 1)
	}

	// Build display rows
	const rows: Array<{ event: string; handlers: number; intents: string }> = []
	for (const [event, count] of eventGroups) {
		const requiredBit = REQUIRED_INTENTS[event]
		let intentStr = ''

		if (requiredBit) {
			if (Array.isArray(requiredBit)) {
				const names = getIntentNames(new Set<GatewayIntentBits>(requiredBit))
				intentStr = names.join(' | ')
			} else {
				intentStr = getIntentNames(new Set<GatewayIntentBits>([requiredBit]))[0]
			}
		}

		rows.push({
			event,
			handlers: count,
			intents: intentStr || '-'
		})
	}

	// Sort by event name
	rows.sort((a, b) => a.event.localeCompare(b.event))

	// Paginate
	const totalPages = Math.max(1, Math.ceil(rows.length / perPage))
	const currentPage = Math.min(Math.max(1, page), totalPages)
	const start = (currentPage - 1) * perPage
	const pageRows = rows.slice(start, start + perPage)

	// Calculate column widths
	const eventWidth = Math.max(5, ...pageRows.map((r) => r.event.length))
	const intentWidth = Math.max(7, ...pageRows.map((r) => r.intents.length))

	ctx.write('Event Listeners\n\n')
	ctx.write(`${'EVENT'.padEnd(eventWidth)}  ${'#'.padEnd(4)}  ${'INTENTS'.padEnd(intentWidth)}\n`)
	ctx.write('\u2500'.repeat(eventWidth + intentWidth + 8) + '\n')

	for (const row of pageRows) {
		const event = row.event.padEnd(eventWidth)
		const handlers = String(row.handlers).padEnd(4)
		const intents = row.intents.padEnd(intentWidth)
		ctx.write(`${event}  ${handlers}  ${intents}\n`)
	}

	ctx.write(`\nPage ${currentPage} of ${totalPages} (${rows.length} total)\n`)
}
