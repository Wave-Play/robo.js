import { getSettings } from '../../core/settings.js'
import { logAction } from '../../core/utils.js'
import { logger } from 'robo.js'
import { ChannelType, Colors } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import type { CommandInteraction, GuildMember } from 'discord.js'

export const config: CommandConfig = {
	description: `Report a member for something`,
	dmPermission: false,
	options: [
		{
			name: 'member',
			description: 'The @member to report',
			type: 'user',
			required: true
		},
		{
			name: 'reason',
			description: 'The reason for the report',
			type: 'string',
			required: true
		},
		{
			name: 'anonymous',
			description: 'Hides your identity from the report, even to moderators',
			type: 'boolean'
		},
		{
			name: 'evidence',
			description: 'Evidence to support the report',
			type: 'attachment'
		}
	]
}

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
	const anonymous = (interaction.options.get('anonymous')?.value as boolean) ?? false
	const evidence = interaction.options.get('evidence')?.attachment
	const member = interaction.options.get('member')?.member as GuildMember
	const reason = interaction.options.get('reason')?.value as string

	// Validate modmail channel
	const { mailChannelId } = getSettings(interaction.guildId)
	if (!mailChannelId) {
		logger.debug(`No modmail channel set for guild ${interaction.guildId}`)
		return {
			embeds: [
				{
					title: 'Oops, something went wrong',
					description: `No modmail channel has set up for this server. Please contact a moderator.`,
					color: Colors.Red
				}
			],
			ephemeral: true
		}
	}

	const mailChannel = interaction.guild?.channels?.cache?.get(mailChannelId)
	if (!mailChannel || mailChannel.type !== ChannelType.GuildText) {
		logger.debug(`Invalid modmail channel for guild ${interaction.guildId}`)
		return {
			embeds: [
				{
					title: 'Oops, something went wrong',
					description: `Invalid modmail channel set up for this server. Please contact a moderator.`,
					color: Colors.Red
				}
			],
			ephemeral: true
		}
	}

	// Submit report to modmail channel
	await mailChannel.send({
		files: evidence ? [evidence] : undefined,
		embeds: [
			{
				title: `Report from ${anonymous ? 'anonymous user' : '@' + interaction.user.username}`,
				color: Colors.Yellow,
				thumbnail: {
					url: member.displayAvatarURL()
				},
				fields: [
					{
						name: 'Reported member',
						value: member.toString()
					},
					{
						name: 'Reason',
						value: reason
					}
				],
				timestamp: new Date().toISOString(),
				footer: {
					icon_url: anonymous ? undefined : interaction.user.displayAvatarURL(),
					text: 'by ' + (anonymous ? 'anonymous user' : '@' + interaction.user.username)
				}
			}
		]
	})

	// Log action to modlogs channel
	logger.debug(`Report submitted to modmail channel for guild ${interaction.guildId}`)
	logAction(interaction.guildId, {
		embeds: [
			{
				title: `Member reported by ${anonymous ? 'anonymous user' : '@' + interaction.user.username}`,
				color: Colors.Yellow,
				thumbnail: {
					url: member.displayAvatarURL()
				},
				fields: [
					{
						name: 'Reported member',
						value: member.toString()
					},
					{
						name: 'Reason',
						value: reason
					}
				],
				timestamp: new Date().toISOString(),
				footer: {
					icon_url: anonymous ? undefined : interaction.user.displayAvatarURL(),
					text: 'by ' + (anonymous ? 'anonymous user' : '@' + interaction.user.username)
				}
			}
		]
	})

	return {
		content: `Thank you for filing a report. A moderator will review it in due time.`,
		ephemeral: true
	}
}
