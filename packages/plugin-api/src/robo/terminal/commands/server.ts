/**
 * /server - Show server subcommands.
 *
 * Interactive terminal command for inspecting and testing the HTTP server.
 */
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Manage and inspect the HTTP server'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	ctx.write('Server commands:\n')
	ctx.write('\n')
	ctx.write('  /server status     Show server dashboard\n')
	ctx.write('  /server routes     List API routes\n')
	ctx.write('  /server curl       Test API routes\n')
	ctx.write('  /server openapi    View OpenAPI spec\n')
	ctx.write('  /open              Open dev server in browser\n')
	ctx.write('\n')
}
