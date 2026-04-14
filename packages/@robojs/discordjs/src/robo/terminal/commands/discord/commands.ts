/**
 * /discord commands - List registered slash commands.
 *
 * Displays all slash commands with their descriptions, option counts,
 * and plugin sources. Subcommands are grouped under their parent.
 */
import { createTerminalCommandConfig, Manifest } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'List registered slash commands',
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

	const summaries = await Manifest.routeSummaries('discordjs', 'commands')

	if (summaries.length === 0) {
		ctx.write('No commands registered\n')
		return
	}

	// Separate top-level commands and subcommands
	const topLevel = summaries.filter((s) => !s.extra?.parent)
	const subcommands = summaries.filter((s) => s.extra?.parent)

	// Group subcommands by parent
	const subcommandsByParent = new Map<string, typeof summaries>()
	for (const sub of subcommands) {
		const parent = sub.extra!.parent as string
		if (!subcommandsByParent.has(parent)) {
			subcommandsByParent.set(parent, [])
		}
		subcommandsByParent.get(parent)!.push(sub)
	}

	// Build display rows: parent followed by its children
	const rows: Array<{ name: string; description: string; options: number; plugin: string }> = []
	for (const cmd of topLevel) {
		const metadata = cmd.metadata as Record<string, unknown> | undefined
		rows.push({
			name: '/' + cmd.key,
			description: (metadata?.description as string) ?? '',
			options: (metadata?.options as unknown[] | undefined)?.length ?? 0,
			plugin: cmd.plugin ?? 'project'
		})

		const children = subcommandsByParent.get(cmd.key)
		if (children) {
			for (const child of children) {
				const childMeta = child.metadata as Record<string, unknown> | undefined
				rows.push({
					name: '  ' + child.key,
					description: (childMeta?.description as string) ?? '',
					options: (childMeta?.options as unknown[] | undefined)?.length ?? 0,
					plugin: child.plugin ?? 'project'
				})
			}
		}
	}

	// Paginate
	const totalPages = Math.max(1, Math.ceil(rows.length / perPage))
	const currentPage = Math.min(Math.max(1, page), totalPages)
	const start = (currentPage - 1) * perPage
	const pageRows = rows.slice(start, start + perPage)

	// Calculate column widths
	const nameWidth = Math.max(7, ...pageRows.map((r) => r.name.length))
	const descWidth = Math.max(11, ...pageRows.map((r) => r.description.length))
	const pluginWidth = Math.max(6, ...pageRows.map((r) => r.plugin.length))

	ctx.write('Registered Commands\n\n')
	ctx.write(
		`${'COMMAND'.padEnd(nameWidth)}  ${'DESCRIPTION'.padEnd(descWidth)}  ${'OPTS'.padEnd(4)}  ${'SOURCE'.padEnd(pluginWidth)}\n`
	)
	ctx.write('\u2500'.repeat(nameWidth + descWidth + pluginWidth + 12) + '\n')

	for (const row of pageRows) {
		const name = row.name.padEnd(nameWidth)
		const desc = row.description.padEnd(descWidth)
		const opts = String(row.options).padEnd(4)
		const plugin = row.plugin.padEnd(pluginWidth)
		ctx.write(`${name}  ${desc}  ${opts}  ${plugin}\n`)
	}

	ctx.write(`\nPage ${currentPage} of ${totalPages} (${rows.length} total)\n`)
}
