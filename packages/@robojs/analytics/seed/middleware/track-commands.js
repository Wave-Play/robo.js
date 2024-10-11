import { Analytics } from '@robojs/analytics'

/*
 * This middleware tracks every time a slash command is used.
 *
 * Required scopes: applications.commands
 */
export default async (data) => {
	const { payload, record } = data

	if (record.type === 'command') {
		const interaction = payload[0]
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
