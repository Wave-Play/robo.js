import { createTerminalCommandConfig, type TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Task management commands'
} as const)

export default function (ctx: TerminalContext<typeof config>) {
	ctx.write('Available subcommands: stats, clear')
}
