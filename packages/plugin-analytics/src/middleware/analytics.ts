import { HandlerRecord } from 'robo.js'
import { Analytics } from '../utils/analytics'
import { ChatInputCommandInteraction, Client, CommandInteraction, InteractionType } from 'discord.js'
import { RawInteractionData } from 'discord.js/typings/rawDataTypes'

export default function (data: { payload: unknown[]; record: HandlerRecord }) {
	const payload = data.payload[0]
	const record = data.record

	//console.log(payload)
	if (payload instanceof CommandInteraction) {
		console.log(payload.commandName)
	}
	// const slashCommand = x.data
	// Analytics.event('slash-commands', {
	// 	name: slashCommand.name,
	// 	pluginName: record.plugin ? record.plugin.name : ''
	// })
}
