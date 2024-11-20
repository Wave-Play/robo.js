import { Analytics } from '@robojs/analytics'
import type { Guild } from 'discord.js'

/*
 * Tracks every time this bot joins a server.
 *
 * Required scopes: applications.commands, guilds
 * Required intents: Guilds
 */
export default (guild: Guild) => {
	Analytics.event('server_join', {
		data: {
			name: guild.name,
			type: 'event'
		},
		sessionId: guild.id
	})
}
