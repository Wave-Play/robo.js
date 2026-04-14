/**
 * /server routes - List API routes.
 *
 * Displays a paginated table of registered API routes with optional filtering.
 */
import { createTerminalCommandConfig, Manifest } from 'robo.js'
import { pluginOptions } from '../../../prepare.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'List API routes',
	options: [
		{
			alias: '-f',
			name: '--filter',
			description: 'Filter routes by path pattern',
			type: 'string',
			default: ''
		},
		{
			alias: '-p',
			name: '--page',
			description: 'Page number',
			type: 'number',
			default: 1
		},
		{
			alias: '-n',
			name: '--per-page',
			description: 'Results per page',
			type: 'number',
			default: 15
		}
	]
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const { filter, page, 'per-page': perPage } = ctx.options

	const routes = await Manifest.routeSummaries('server', 'api')

	if (routes.length === 0) {
		ctx.write('No API routes registered\n')
		return
	}

	const prefix = pluginOptions.prefix ?? ''

	// Apply filter
	let filtered = routes
	if (filter) {
		const pattern = filter.toLowerCase()
		filtered = routes.filter((r) => {
			const fullPath = prefix + '/' + r.key
			return fullPath.toLowerCase().includes(pattern)
		})
	}

	if (filtered.length === 0) {
		ctx.write(`No routes matching "${filter}"\n`)
		return
	}

	// Pagination
	const totalPages = Math.ceil(filtered.length / perPage)
	const currentPage = Math.max(1, Math.min(page, totalPages))
	const start = (currentPage - 1) * perPage
	const pageItems = filtered.slice(start, start + perPage)

	// Column widths
	const pathWidth = 40
	const sourceWidth = 30

	ctx.write('PATH'.padEnd(pathWidth) + 'SOURCE'.padEnd(sourceWidth) + 'PLUGIN\n')
	ctx.write('\u2500'.repeat(pathWidth + sourceWidth + 10) + '\n')

	for (const route of pageItems) {
		const fullPath = prefix + '/' + route.key
		const source = route.key
		const plugin = route.plugin ?? '-'

		ctx.write(fullPath.padEnd(pathWidth) + source.padEnd(sourceWidth) + plugin + '\n')
	}

	ctx.write('\n')
	ctx.write(`Page ${currentPage} of ${totalPages} (${filtered.length} total)\n`)
}
