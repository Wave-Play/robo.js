/**
 * /skills - Show installed skills or list subcommands.
 *
 * Interactive terminal command for managing AI coding skills during development.
 */
import { createTerminalCommandConfig } from '../../../core/cli-config-helpers.js'
import type { TerminalContext } from '../../../types/cli.js'

export const config = createTerminalCommandConfig({
	description: 'Manage AI coding skills from plugins'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	ctx.write('Skills commands:\n')
	ctx.write('\n')
	ctx.write('  /skills list              List installed and available skills\n')
	ctx.write('  /skills install <plugin>  Install skills from a plugin\n')
	ctx.write('  /skills install --all     Install from all plugins\n')
	ctx.write('\n')
}
