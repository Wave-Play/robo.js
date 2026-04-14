/**
 * /mock - Show available mock server commands.
 *
 * Interactive terminal command for inspecting and managing
 * the mock Discord environment powered by @robojs/mock.
 */
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Inspect and manage the mock Discord environment'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	ctx.write('Mock commands:\n')
	ctx.write('\n')
	ctx.write('  /mock status     Show mock session dashboard\n')
	ctx.write('  /mock stage      Open the Stage UI in your browser\n')
	ctx.write('  /mock actions    List recorded bot actions\n')
	ctx.write('  /mock reset      Reset session state\n')
	ctx.write('  /mock command    Invoke a slash command\n')
	ctx.write('  /mock sessions   List all active sessions\n')
	ctx.write('  /mock use        Switch target session\n')
	ctx.write('\n')
}
