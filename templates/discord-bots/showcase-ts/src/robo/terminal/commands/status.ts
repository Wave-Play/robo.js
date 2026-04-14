import { createTerminalCommandConfig, Robo } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Show all status items'
} as const)

export default function (ctx: TerminalContext<typeof config>) {
	const all = Robo.status.getAll()
	if (all.size === 0) {
		ctx.write('No status items.')
		return
	}

	for (const [key, entry] of all) {
		ctx.write(`[${entry.priority}] ${key}: ${entry.value}`)
	}
}
