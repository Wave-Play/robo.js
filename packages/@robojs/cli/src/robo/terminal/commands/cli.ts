/**
 * /cli - Show available CLI dev commands.
 *
 * Interactive terminal command for testing and inspecting
 * CLI commands powered by @robojs/cli.
 */
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Test and inspect CLI commands'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	ctx.write('CLI commands:\n')
	ctx.write('\n')
	ctx.write('  /cli list     List registered CLI commands\n')
	ctx.write('  /cli run      Run a CLI command inline\n')
	ctx.write('  /cli link     Link your CLI for local development\n')
	ctx.write('\n')
}
