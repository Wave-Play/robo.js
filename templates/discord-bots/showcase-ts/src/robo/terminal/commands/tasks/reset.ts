import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'
import { resetTaskStats } from '~/utils/kv.js'

export const config = createTerminalCommandConfig({
	description: 'Reset task KV counters'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	await resetTaskStats()
	ctx.write('Task stats counters have been reset.')
}
