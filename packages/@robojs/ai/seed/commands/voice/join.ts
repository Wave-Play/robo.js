import { ChannelType, ChatInputCommandInteraction } from 'discord.js'
import { CommandOptions, createCommandConfig } from 'robo.js'
import { AI, TokenLimitError } from '@robojs/ai'

/*
  AI Voice Join Command

  Makes the AI bot join a voice channel for live voice conversations. It accepts
  a required "channel" option. You can make this optional to auto-join the
  user's current channel, or add options like deaf/mute preferences.

  Voice features require configuring the AI plugin with a voice-capable engine.

  Learn more:
  - Commands guide: https://robojs.dev/discord-bots/commands
  - AI plugin docs: https://robojs.dev/plugins/ai
*/
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

/**
 * Starts a voice session in the specified channel using the AI's voice capabilities.
 * The bot listens, transcribes speech, generates responses, and plays them back via TTS.
 * Catches TokenLimitError to provide friendly feedback when usage limits are exceeded.
 * Reply is ephemeral to avoid channel clutter.
 */
export default async (interaction: ChatInputCommandInteraction, options: CommandOptions<typeof config>) => {
	// Catch TokenLimitError specifically to handle exceeded token usage limits.
	try {
		// Start a voice session for this guild/channel. deaf: false allows the bot to hear others.
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

	// Success message is ephemeral to notify only the command user without pinging the channel.
	return { content: `Joining ${options.channel.name}…`, ephemeral: true }
}
