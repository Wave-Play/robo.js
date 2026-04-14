import type { CliContext } from 'robo.js'

export const config = {
	description: 'Extension for greet command',
	priority: 10,
	options: [
		{ alias: '-c', name: '--count', description: 'Number of times to repeat', type: 'number', default: 1 }
	]
}

export async function before(ctx: CliContext) {
	console.log('[greet extension] Before hook running')
	// Extension can add data to context
	return true
}

export async function after(ctx: CliContext) {
	const count = ((ctx.options as Record<string, unknown>).count as number) || 1
	console.log(`[greet extension] After hook - result:`, ctx.result)
	if (count > 1) {
		console.log(`[greet extension] Would repeat ${count} times`)
	}
}
