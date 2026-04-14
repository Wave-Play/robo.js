/**
 * /discord guilds - List connected guilds.
 *
 * Displays all guilds the bot is currently connected to,
 * including name, ID, member count, and owner status.
 */
import { getClient, hasClient } from '../../../../core/client.js'
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'List connected guilds',
	options: [
		{
			alias: '-p',
			name: '--page',
			description: 'Page number',
			type: 'number'
		},
		{
			alias: '-n',
			name: '--per-page',
			description: 'Items per page',
			type: 'number'
		}
	]
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	if (!hasClient()) {
		ctx.write('Bot not connected\n')
		ctx.write('Make sure @robojs/discordjs is installed and the bot has started.\n')
		return
	}

	const client = getClient()
	const page = ctx.options.page ?? 1
	const perPage = ctx.options['per-page'] ?? 15

	const guilds = Array.from(client.guilds.cache.values())

	if (guilds.length === 0) {
		ctx.write('Not connected to any guilds\n')
		return
	}

	// Sort by member count descending
	guilds.sort((a, b) => b.memberCount - a.memberCount)

	// Paginate
	const totalPages = Math.max(1, Math.ceil(guilds.length / perPage))
	const currentPage = Math.min(Math.max(1, page), totalPages)
	const start = (currentPage - 1) * perPage
	const pageGuilds = guilds.slice(start, start + perPage)

	// Calculate column widths
	const nameWidth = Math.max(4, ...pageGuilds.map((g) => g.name.length))
	const idWidth = Math.max(2, ...pageGuilds.map((g) => g.id.length))
	const memberWidth = Math.max(7, ...pageGuilds.map((g) => String(g.memberCount).length))

	ctx.write(`Connected Guilds (${guilds.length})\n\n`)
	ctx.write(`${'NAME'.padEnd(nameWidth)}  ${'ID'.padEnd(idWidth)}  ${'MEMBERS'.padEnd(memberWidth)}  OWNER\n`)
	ctx.write('\u2500'.repeat(nameWidth + idWidth + memberWidth + 14) + '\n')

	for (const guild of pageGuilds) {
		const isOwner = guild.ownerId === client.user?.id
		const name = guild.name.padEnd(nameWidth)
		const id = guild.id.padEnd(idWidth)
		const members = String(guild.memberCount).padEnd(memberWidth)
		ctx.write(`${name}  ${id}  ${members}  ${isOwner ? 'Yes' : 'No'}\n`)
	}

	ctx.write(`\nPage ${currentPage} of ${totalPages} (${guilds.length} total)\n`)
}
