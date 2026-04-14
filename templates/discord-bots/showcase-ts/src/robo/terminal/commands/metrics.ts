import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'
import { Flashcore } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Show or reset Flashcore metrics',
	options: [
		{
			name: '--reset',
			alias: '-r',
			description: 'Reset metrics after displaying',
			type: 'boolean'
		}
	]
} as const)

export default function (ctx: TerminalContext<typeof config>) {
	const m = Flashcore.$.metrics()

	const total = m.operations.create + m.operations.update + m.operations.delete
		+ m.operations.findUnique + m.operations.findMany

	ctx.write('Flashcore Metrics\n')
	ctx.write(`Operations: ${total} total\n`)
	ctx.write(`  create: ${m.operations.create}  update: ${m.operations.update}  delete: ${m.operations.delete}\n`)
	ctx.write(`  findUnique: ${m.operations.findUnique}  findMany: ${m.operations.findMany}\n`)
	ctx.write(`Cache: ${m.cacheHits} hits / ${m.cacheMisses} misses\n`)
	ctx.write(`Avg Query: ${m.avgQueryTime.toFixed(2)}ms\n`)

	if (m.indexRebuilds > 0) {
		ctx.write(`Index Rebuilds: ${m.indexRebuilds}\n`)
	}

	if (ctx.options.reset) {
		Flashcore.$.resetMetrics()
		ctx.write('\nMetrics reset.')
	}
}
