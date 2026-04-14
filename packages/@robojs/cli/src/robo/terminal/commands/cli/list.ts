/**
 * /cli list - List registered CLI commands.
 *
 * Displays all CLI commands with their descriptions.
 * Subcommands are grouped under their parent.
 */
import { createTerminalCommandConfig, Manifest } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'List registered CLI commands',
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

	const summaries = await Manifest.routeSummaries('cli', 'cli')

	if (summaries.length === 0) {
		ctx.write('No CLI commands registered\n')
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

	// Track which parent groups have been displayed
	const displayedParents = new Set<string>()

	// Build display rows: parent followed by its children
	const rows: Array<{ name: string; description: string }> = []
	for (const cmd of topLevel) {
		const metadata = cmd.metadata as Record<string, unknown> | undefined
		rows.push({
			name: cmd.key,
			description: (metadata?.description as string) ?? ''
		})
		displayedParents.add(cmd.key)

		const children = subcommandsByParent.get(cmd.key)
		if (children) {
			for (const child of children) {
				const childMeta = child.metadata as Record<string, unknown> | undefined
				rows.push({
					name: '  ' + child.key,
					description: (childMeta?.description as string) ?? ''
				})
			}
		}
	}

	// Display orphaned subcommands whose parent has no handler file
	for (const [parent, children] of subcommandsByParent) {
		if (displayedParents.has(parent)) {
			continue
		}
		for (const child of children) {
			const childMeta = child.metadata as Record<string, unknown> | undefined
			rows.push({
				name: child.key,
				description: (childMeta?.description as string) ?? ''
			})
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

	ctx.write('Registered CLI Commands\n\n')
	ctx.write(`${'COMMAND'.padEnd(nameWidth)}  ${'DESCRIPTION'.padEnd(descWidth)}\n`)
	ctx.write('\u2500'.repeat(nameWidth + descWidth + 2) + '\n')

	for (const row of pageRows) {
		const name = row.name.padEnd(nameWidth)
		const desc = row.description.padEnd(descWidth)
		ctx.write(`${name}  ${desc}\n`)
	}

	ctx.write(`\nPage ${currentPage} of ${totalPages} (${rows.length} total)\n`)
}
