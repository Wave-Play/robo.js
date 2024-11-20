import { getSettings } from '../../core/settings.js'
import { logAction } from '../../core/utils.js'
import { logger } from 'robo.js'
import { Colors, PermissionFlagsBits } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import type { CommandInteraction, GuildMember } from 'discord.js'

export const config: CommandConfig = {
	defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
	dmPermission: false,
	description: `Times out a member for a specified amount of time`,
	options: [
		{
			name: 'user',
			description: 'The user to timeout',
			type: 'user',
			required: true
		},
		{
			name: 'duration',
			description: 'How long they should be timed out for',
			type: 'integer',
			choices: [
				{
					name: '60 secs',
					value: 60
				},
				{
					name: '5 mins',
					value: 300
				},
				{
					name: '10 mins',
					value: 600
				},
				{
					name: '1 hour',
					value: 3600
				},
				{
					name: '1 day',
					value: 86400
				},
				{
					name: '1 week',
					value: 604800
				}
			],
			required: true
		},
		{
			name: 'reason',
			description: 'The reason for timing them out, if any'
		}
	]
}

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
	const duration = interaction.options.get('duration')?.value as number
	const reason = interaction.options.get('reason')?.value as string
	const user = interaction.options.get('user')?.member as GuildMember

	// Validate the command
	if (!interaction.guild) {
		return 'This command can only be used in a server'
	} else if (!user || interaction.memberPermissions === null) {
		return 'Invalid command usage'
	} else if (user.id === interaction.user.id) {
		return 'Sorry, you cannot time yourself out'
	} else if (user.id === interaction.client.user?.id) {
		return 'Sorry, you cannot time me out'
	}

	// Get settings
	const { logsChannelId, testMode } = getSettings(interaction.guildId)

	// Validate permissions
	if ((interaction.memberPermissions.bitfield & PermissionFlagsBits.BanMembers) !== PermissionFlagsBits.BanMembers) {
		return 'You do not have permission to timeout members'
	}

	// Time out! >:3
	if (!testMode) {
		await user.timeout(duration, reason)
		logger.info(`Timed out ${user.user.tag} for ${duration} seconds`)
	}

	// Log action to modlogs channel if this is not it
	if (logsChannelId && interaction.channelId !== logsChannelId) {
		const testPrefix = testMode ? '[TEST] ' : ''
		logAction(interaction.guildId, {
			embeds: [
				{
					title: testPrefix + `Timed out member`,
					thumbnail: {
						url: user.displayAvatarURL()
					},
					description: `${user} has been timed out for ${duration} seconds`,
					color: Colors.Yellow,
					timestamp: new Date().toISOString(),
					footer: {
						icon_url: interaction.user.displayAvatarURL(),
						text: 'by @' + interaction.user.username
					}
				}
			]
		})
	}

	// Test mode - don't send timeout
	if (testMode) {
		return {
			embeds: [
				{
					title: 'Test mode',
					description: 'This is a test. No action has been taken.',
					color: Colors.Yellow,
					footer: {
						text: (logsChannelId ? 'See' : 'Setup') + ` modlogs channel for details`
					}
				}
			]
		}
	}

	return {
		embeds: [
			{
				title: 'Timed out member',
				thumbnail: {
					url: user.displayAvatarURL()
				},
				description: `${user} has been timed out for ${duration} seconds`,
				color: Colors.Yellow
			}
		]
	}
}
