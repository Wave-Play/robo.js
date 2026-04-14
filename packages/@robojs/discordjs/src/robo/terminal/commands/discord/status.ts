/**
 * /discord status - Show bot status dashboard.
 *
 * Displays the current state of the Discord bot including
 * connection info, uptime, ping, and registered handler counts.
 */
import { getClient, hasClient } from '../../../../core/client.js'
import { createTerminalCommandConfig, Manifest } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Show bot status dashboard'
} as const)

function formatUptime(ms: number | null): string {
	if (ms === null) {
		return 'N/A'
	}

	const seconds = Math.floor(ms / 1000)
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = seconds % 60

	const parts: string[] = []
	if (hours > 0) {
		parts.push(`${hours}h`)
	}
	if (minutes > 0) {
		parts.push(`${minutes}m`)
	}
	parts.push(`${secs}s`)

	return parts.join(' ')
}

export default async function (ctx: TerminalContext<typeof config>) {
	if (!hasClient()) {
		ctx.write('Bot not connected\n')
		ctx.write('Make sure @robojs/discordjs is installed and the bot has started.\n')
		return
	}

	const client = getClient()
	const user = client.user

	ctx.write('Discord Bot Status\n')
	ctx.write('\n')
	ctx.write(`  Username:   ${user?.tag ?? 'Unknown'}\n`)
	ctx.write(`  Status:     Online\n`)
	ctx.write(`  Guilds:     ${client.guilds.cache.size}\n`)
	ctx.write(`  WS Ping:    ${client.ws.ping}ms\n`)
	ctx.write(`  Uptime:     ${formatUptime(client.uptime)}\n`)
	ctx.write('\n')

	const commands = Manifest.routeSummariesSync('discordjs', 'commands')
	const events = Manifest.routeSummariesSync('discordjs', 'events')
	const context = Manifest.routeSummariesSync('discordjs', 'context')
	const middleware = Manifest.routeSummariesSync('discordjs', 'middleware')

	ctx.write('  Handlers:\n')
	ctx.write(`    Commands:     ${commands.length}\n`)
	ctx.write(`    Events:       ${events.length}\n`)
	ctx.write(`    Context:      ${context.length}\n`)
	ctx.write(`    Middleware:    ${middleware.length}\n`)
	ctx.write('\n')
}
