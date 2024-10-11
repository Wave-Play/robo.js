import { Analytics } from '@robojs/analytics'

/*
 * Tracks every time this bot joins a server.
 *
 * Required scopes: applications.commands, guilds
 * Required intents: Guilds
 */
export default (guild) => {
	Analytics.event('server_join', {
		data: {
			name: guild.name,
			type: 'event'
		},
		sessionId: guild.id
	})
}
