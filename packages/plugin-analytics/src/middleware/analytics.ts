import { HandlerRecord } from 'robo.js'
import { Analytics } from '../utils/analytics'
import { ChatInputCommandInteraction, Client, CommandInteraction, InteractionResponse } from 'discord.js'

export default function (data: { payload: unknown[]; record: HandlerRecord }) {
	const payload = data.payload[0]
	const record = data.record

	if (record.type === 'command') {
		const command = payload as ChatInputCommandInteraction
		Analytics.event({
			category: 'slash-command',
			label: command.commandName,
			id: command.guildId ? command.guildId : '',
			user: {
				id: command.user.id
			}
		})
	}
}
