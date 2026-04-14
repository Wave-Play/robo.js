/**
 * /tunnel - Show tunnel status or list subcommands.
 *
 * Interactive terminal command for managing tunnels during development.
 * Tunnels expose your local server to the internet via Cloudflare Quick Tunnels.
 */
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Manage tunnels for local development'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	ctx.write('Tunnel commands:\n')
	ctx.write('\n')
	ctx.write('  /tunnel start            Start a tunnel (background)\n')
	ctx.write('  /tunnel start -p 8080    Start a tunnel on specific port\n')
	ctx.write('  /tunnel list             List all running tunnels\n')
	ctx.write('  /tunnel stop <id>        Stop a specific tunnel\n')
	ctx.write('  /tunnel stop --all       Stop all running tunnels\n')
	ctx.write('\n')
}
