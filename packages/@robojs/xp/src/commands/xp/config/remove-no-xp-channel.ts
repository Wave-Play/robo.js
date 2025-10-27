import { type ChatInputCommandInteraction, ChannelType } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import { logger } from 'robo.js'
import { getConfig, setConfig } from '../../../config.js'
import {
	hasAdminPermission,
	getRequiredPermissionBit,
	requireGuild,
	createSuccessEmbed,
	createErrorEmbed,
	createPermissionError,
	formatChannel
} from '../../../core/utils.js'

export const config: CommandConfig = {
	description: 'Remove a channel from No-XP list',
	defaultMemberPermissions: getRequiredPermissionBit(),
	dmPermission: false,
	options: [
		{
			name: 'channel',
			type: 'channel',
			required: true,
			description: 'Channel to allow XP gain',
			channelTypes: [ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildAnnouncement]
		}
	]
}

export default async function (interaction: ChatInputCommandInteraction): Promise<CommandResult> {
	try {
		// Validate guild context
		const guildCheck = requireGuild(interaction)
		if (typeof guildCheck === 'string') {
			return {
				embeds: [createErrorEmbed('Error', guildCheck)],
				ephemeral: true
			}
		}
		const { guildId } = guildCheck

		// Check permissions
		if (!hasAdminPermission(interaction)) {
			return createPermissionError()
		}

		// Get option
		const channel = interaction.options.getChannel('channel', true)

		// Load current config
		const guildConfig = await getConfig(guildId)

		// Check if channel in list
		if (!guildConfig.noXpChannelIds.includes(channel.id)) {
			return {
				embeds: [createErrorEmbed('Channel Not Found', 'This channel is not in the No-XP list')],
				ephemeral: true
			}
		}

		// Remove channel from list
		const updatedList = guildConfig.noXpChannelIds.filter((id) => id !== channel.id)

		// Update config
		await setConfig(guildId, { noXpChannelIds: updatedList })

		// Create success embed
		const fields = [
			{
				name: 'Channel',
				value: `${'name' in channel ? channel.name : 'Unknown'} (${formatChannel(channel.id)})`,
				inline: true
			},
			{ name: 'Remaining No-XP Channels', value: `${updatedList.length}`, inline: true },
			{ name: 'Effect', value: 'Messages in this channel will now earn XP', inline: false }
		]

		return {
			embeds: [
				createSuccessEmbed(
					'No-XP Channel Removed',
					`Messages in ${formatChannel(channel.id)} can now award XP`,
					fields
				)
			]
		}
	} catch (error) {
		logger.error('Error in /xp config remove-no-xp-channel command:', error)
		return {
			embeds: [
				createErrorEmbed(
					'Error',
					error instanceof Error
						? error.message
						: 'An unexpected error occurred while removing No-XP channel'
				)
			],
			ephemeral: true
		}
	}
}
