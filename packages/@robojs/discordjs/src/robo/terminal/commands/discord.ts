/**
 * /discord - Show available Discord bot commands.
 *
 * Interactive terminal command for inspecting and managing
 * the Discord bot powered by @robojs/discordjs.
 */
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Inspect and manage your Discord bot'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	ctx.write('Discord commands:\n')
	ctx.write('\n')
	ctx.write('  /discord status     Show bot status dashboard\n')
	ctx.write('  /discord commands   List registered slash commands\n')
	ctx.write('  /discord events     List event listeners\n')
	ctx.write('  /discord intents    Analyze intent configuration\n')
	ctx.write('  /discord guilds     List connected guilds\n')
	ctx.write('\n')
}
