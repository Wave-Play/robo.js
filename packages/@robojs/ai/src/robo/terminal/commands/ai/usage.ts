/**
 * /ai usage - View token usage.
 *
 * Displays a paginated table of token usage by model, with optional
 * window filtering and limit status.
 */
import { createTerminalCommandConfig } from 'robo.js'
import { AI } from '../../../../core/ai.js'
import { tokenLedger } from '../../../../core/token-ledger.js'
import type { TerminalContext } from 'robo.js'

const fmt = new Intl.NumberFormat('en-US')

export const config = createTerminalCommandConfig({
	description: 'View token usage',
	options: [
		{
			alias: '-w',
			name: '--window',
			description: 'Time window: day, week, month, or lifetime',
			type: 'string'
		},
		{
			alias: '-m',
			name: '--model',
			description: 'Filter by model name',
			type: 'string'
		},
		{
			alias: '-p',
			name: '--page',
			description: 'Page number',
			type: 'number'
		},
		{
			alias: '-n',
			name: '--per-page',
			description: 'Results per page',
			type: 'number'
		}
	]
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const window = ctx.options.window ?? 'lifetime'
	const model = ctx.options.model
	const page = Math.max(1, ctx.options.page ?? 1)
	const perPage = Math.max(1, ctx.options['per-page'] ?? 15)

	// Build rows from usage data
	type Row = { model: string; windowKey: string; tokensIn: number; tokensOut: number; total: number }
	const rows: Row[] = []

	if (window === 'lifetime') {
		const totals = await AI.getLifetimeUsage(model)
		for (const [modelName, t] of Object.entries(totals)) {
			rows.push({
				model: modelName,
				windowKey: 'lifetime',
				tokensIn: t.tokensIn,
				tokensOut: t.tokensOut,
				total: t.total
			})
		}
	} else {
		const summary = await AI.getUsageSummary({
			window: window as 'day' | 'week' | 'month',
			model
		})
		for (const r of summary.results) {
			rows.push({
				model: r.model,
				windowKey: r.windowKey,
				tokensIn: r.totals.tokensIn,
				tokensOut: r.totals.tokensOut,
				total: r.totals.total
			})
		}
	}

	if (rows.length === 0) {
		ctx.write('No token usage recorded\n')
		return
	}

	// Pagination
	const totalRows = rows.length
	const totalPages = Math.ceil(totalRows / perPage)
	const startIdx = (page - 1) * perPage
	const pageRows = rows.slice(startIdx, startIdx + perPage)

	if (pageRows.length === 0) {
		ctx.write(`Page ${page} is out of range (${totalPages} total pages)\n`)
		return
	}

	// Column widths
	const modelWidth = Math.max(5, ...pageRows.map((r) => r.model.length))
	const windowWidth = window === 'lifetime' ? 0 : Math.max(6, ...pageRows.map((r) => r.windowKey.length))

	// Header
	ctx.write(`Token Usage (${window})\n`)
	ctx.write('\u2500'.repeat(70) + '\n')

	let header = `${'MODEL'.padEnd(modelWidth)}  `
	if (windowWidth > 0) {
		header += `${'WINDOW'.padEnd(windowWidth)}  `
	}
	header += `${'TOKENS IN'.padStart(12)}  ${'TOKENS OUT'.padStart(12)}  ${'TOTAL'.padStart(12)}`
	ctx.write(header + '\n')
	ctx.write('\u2500'.repeat(70) + '\n')

	// Rows
	for (const row of pageRows) {
		let line = `${row.model.padEnd(modelWidth)}  `
		if (windowWidth > 0) {
			line += `${row.windowKey.padEnd(windowWidth)}  `
		}
		line += `${fmt.format(row.tokensIn).padStart(12)}  `
		line += `${fmt.format(row.tokensOut).padStart(12)}  `
		line += `${fmt.format(row.total).padStart(12)}`
		ctx.write(line + '\n')
	}

	ctx.write('\u2500'.repeat(70) + '\n')
	ctx.write(`Page ${page} of ${totalPages} (${totalRows} total)\n`)

	// Limit status
	const limits = tokenLedger.getLimits()
	const perModel = limits.perModel
	if (perModel && Object.keys(perModel).length > 0) {
		ctx.write('\nLimits\n')
		ctx.write('\u2500'.repeat(50) + '\n')
		for (const [modelName, rule] of Object.entries(perModel)) {
			const mode = rule.mode ?? 'warn'
			ctx.write(`  ${modelName}: ${fmt.format(rule.maxTokens)} / ${rule.window} (${mode})\n`)
		}
	}

	ctx.write('\n')
}
