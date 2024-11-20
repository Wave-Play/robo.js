import { Analytics } from '@robojs/analytics'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { MiddlewareData } from 'robo.js'

/*
 * This middleware tracks every time a slash command is used.
 *
 * Required scopes: applications.commands
 */
export default async (data: MiddlewareData) => {
	const { payload, record } = data

	if (record.type === 'command') {
		const interaction = payload[0] as ChatInputCommandInteraction
		const name = record.key.replaceAll('/', '_').replaceAll('-', '_')

		Analytics.event(name, {
			data: {
				type: 'slash_command'
			},
			sessionId: interaction.channelId ?? interaction.guildId,
			userId: interaction.user?.id
		})
	}
}
