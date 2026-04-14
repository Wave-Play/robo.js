/**
 * /analytics - Root help listing for analytics terminal commands
 */
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Analytics plugin commands'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	ctx.write('\n')
	ctx.write('  Available subcommands:\n')
	ctx.write('\n')
	ctx.write('  /analytics status   Show analytics configuration\n')
	ctx.write('  /analytics test     Fire a test event\n')
	ctx.write('  /analytics fire     Fire a custom event\n')
	ctx.write('\n')
}
