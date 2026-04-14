/**
 * /ai - Show available AI subcommands.
 *
 * Interactive terminal command for inspecting and managing the AI engine.
 */
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Manage the AI engine'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	ctx.write('AI commands:\n')
	ctx.write('\n')
	ctx.write('  /ai status       Show AI engine status\n')
	ctx.write('  /ai usage        View token usage\n')
	ctx.write('\n')
}
