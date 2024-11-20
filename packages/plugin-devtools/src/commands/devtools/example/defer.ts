import { CommandConfig } from 'robo.js'
import { logger } from '../../../core/helpers.js'
import type { CommandInteraction } from 'discord.js'

export const config: CommandConfig = {
	description: `Run Sage's automatic deferal feature`,
	options: [
		{
			name: 'delay',
			description: 'Length to run command for in milliseconds',
			type: 'integer'
		},
		{
			name: 'manual-reply',
			description: 'Whether to manually reply to the interaction',
			type: 'boolean'
		},
		{
			name: 'no-reply',
			description: 'Avoid replying to the interaction at all',
			type: 'boolean'
		}
	]
}

export default async (interaction: CommandInteraction) => {
	const delay = (interaction.options.get('delay')?.value as number) ?? 0
	const manualReply = (interaction.options.get('manual-reply')?.value as boolean) ?? false
	const noReply = (interaction.options.get('no-reply')?.value as boolean) ?? false

	// Mock delay as if we were doing something
	if (delay > 0) {
		await new Promise((resolve) => setTimeout(resolve, delay))
	}

	// Avoid replying to the interaction at all
	if (noReply) {
		logger.custom('dev', `Not replying to deferred interaction...`)
		return
	}

	// Reply to the interaction manually
	if (manualReply) {
		logger.custom('dev', `Deferred? ${interaction.deferred} | Replied? ${interaction.replied}`)
		logger.custom('dev', `Manually replying to deferred interaction...`)
		try {
			await interaction.reply('This is an manual reply to a command!')
		} catch {
			await interaction.editReply('This is an manual reply to an auto deferred command!')
		}
		return
	}

	return 'This is an auto deferred command!'
}
