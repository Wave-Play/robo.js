/**
 * /dev logs - View recent Robo logs
 */
import { Colors, EmbedBuilder, codeBlock } from 'discord.js'
import { Flashcore } from 'robo.js'
import type { ChatInputCommandInteraction } from 'discord.js'

interface CommandConfig {
	description: string
	sage?: {
		defer?: boolean
		ephemeral?: boolean
	}
}

export const config: CommandConfig = {
	description: 'View recent Robo logs',
	sage: {
		defer: true,
		ephemeral: true
	}
}

export default async function (_interaction: ChatInputCommandInteraction) {
	const logs = await Flashcore.get<string[]>('__robo_logs')

	if (!logs || logs.length === 0) {
		return 'No logs available.'
	}

	const embed = new EmbedBuilder()
		.setTitle('Recent Logs')
		.setDescription(codeBlock(logs.join('\n').slice(-4000)))
		.setColor(Colors.Blurple)
		.setTimestamp()

	return { embeds: [embed] }
}
