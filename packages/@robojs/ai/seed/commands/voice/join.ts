import { ChannelType, ChatInputCommandInteraction } from 'discord.js'
import { CommandOptions, createCommandConfig } from 'robo.js'
import { AI, TokenLimitError } from '@robojs/ai'

export const config = createCommandConfig({
	description: 'Join the voice channel you are in',
	options: [
		{
			name: 'channel',
			description: 'The voice channel to join (if not in a channel, you must specify one)',
			required: true,
			type: 'channel',
			channelTypes: [ChannelType.GuildVoice, ChannelType.GuildStageVoice]
		}
	]
} as const)

export default async (interaction: ChatInputCommandInteraction, options: CommandOptions<typeof config>) => {
	try {
		await AI.startVoice({
			guildId: interaction.guildId!,
			channelId: options.channel.id,
			deaf: false
		})
	} catch (error) {
		if (error instanceof TokenLimitError) {
			return { content: error.displayMessage, ephemeral: true }
		}
		throw error
	}

	return { content: `Joining ${options.channel.name}…`, ephemeral: true }
}
