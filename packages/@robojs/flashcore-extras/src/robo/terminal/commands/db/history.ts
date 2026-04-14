/**
 * /db history - Show schema version history
 */
import { color, createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Show schema version history',
	options: [
		{ alias: '-n', name: '--namespace', description: 'Specific namespace to show history for', type: 'string' },
		{ alias: '-l', name: '--limit', description: 'Maximum number of entries to show', type: 'string' },
		{ alias: '-v', name: '--verbose', description: 'Print more information for debugging', type: 'boolean' }
	]
} as const)

const Indent = '   '

export default async function (ctx: TerminalContext<typeof config>) {
	const { namespace: namespaceOpt, limit: limitOpt, verbose } = ctx.options
	const namespace = namespaceOpt || 'default'
	const limit = limitOpt ? parseInt(limitOpt, 10) : 20

	try {
		const { Flashcore } = await import('robo.js/flashcore')

		if (!Flashcore.$.isInitialized) {
			ctx.write('\n')
			ctx.write(Indent + 'Flashcore has not been initialized.\n')
			ctx.write('\n')
			return
		}

		const historyManager = Flashcore.$._schemaHistoryManager
		if (!historyManager) {
			ctx.write('\n')
			ctx.write(Indent + 'Schema history manager not available.\n')
			ctx.write('\n')
			return
		}

		const history = await historyManager.getHistory(namespace)

		ctx.write('\n')
		ctx.write(Indent + color.bold(`Schema History: ${namespace}`) + '\n')
		ctx.write(Indent + '='.repeat(20 + namespace.length) + '\n')
		ctx.write('\n')

		if (history.length === 0) {
			ctx.write(Indent + color.dim('No history entries.') + '\n')
			ctx.write('\n')
			return
		}

		// Show most recent entries first, up to limit
		const entriesToShow = history.slice(-limit).reverse()

		for (const entry of entriesToShow) {
			const date = new Date(entry.timestamp)
			const dateStr = date.toISOString().replace('T', ' ').slice(0, 19)

			ctx.write(Indent + color.bold(`Version ${entry.version}`) + '\n')
			ctx.write(Indent + '  ' + color.dim('Date: ') + dateStr + '\n')
			ctx.write(Indent + '  ' + color.dim('Checksum: ') + entry.checksum + '\n')

			if (entry.changeCount > 0) {
				const changeLabel = entry.hasBreakingChanges ? 'breaking' : 'safe'
				const changeText = entry.hasBreakingChanges
					? color.red(`${entry.changeCount} (${changeLabel})`)
					: color.green(`${entry.changeCount} (${changeLabel})`)
				ctx.write(Indent + '  ' + color.dim('Changes: ') + changeText + '\n')
			}

			if (entry.migrationName) {
				ctx.write(Indent + '  ' + color.dim('Migration: ') + color.cyan(entry.migrationName) + '\n')
			}

			ctx.write('\n')
		}

		if (history.length > limit) {
			ctx.write(Indent + color.dim(`Showing ${limit} of ${history.length} entries.`) + '\n')
			ctx.write(Indent + color.dim('Use --limit to show more.') + '\n')
			ctx.write('\n')
		}
	} catch (error) {
		ctx.write(Indent + `Failed to get history: ${error}\n`)
	}
}
