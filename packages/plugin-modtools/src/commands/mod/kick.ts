import { autocompleteDeleteMessages, deleteMessagesOptions } from '../../core/constants.js'
import { deleteRecentUserMessages, logAction } from '../../core/utils.js'
import { getSettings } from '../../core/settings.js'
import { logger } from 'robo.js'
import { Colors, PermissionFlagsBits } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import type { CommandInteraction, MessageCreateOptions } from 'discord.js'

export const config: CommandConfig = {
	defaultMemberPermissions: PermissionFlagsBits.KickMembers,
	description: `Kick a member from the server`,
	dmPermission: false,
	options: [
		{
			name: 'member',
			description: 'The @member to kick',
			type: 'user',
			required: true
		},
		{
			name: 'reason',
			description: 'The reason for the kick',
			type: 'string'
		},
		{
			name: 'delete_messages',
			description: 'How much of their recent message history to delete',
			autocomplete: true
		},
		{
			name: 'anonymous',
			description: 'Whether to execute the kick anonymously',
			type: 'boolean'
		}
	]
}

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
	const anonymous = (interaction.options.get('anonymous')?.value as boolean) ?? false
	const deleteMessages = interaction.options.get('delete_messages')?.value as string
	const user = interaction.options.getUser('member')
	const reason = interaction.options.get('reason')?.value as string

	// Validate the command
	if (!interaction.guild) {
		return 'This command can only be used in a server'
	} else if (deleteMessages && !deleteMessagesOptions.map((option) => option.value).includes(deleteMessages)) {
		return 'Invalid delete_messages option'
	} else if (!user || interaction.memberPermissions === null) {
		return 'Invalid command usage'
	} else if (user.id === interaction.user.id) {
		return 'Sorry, you cannot kick yourself'
	} else if (user.id === interaction.client.user?.id) {
		return 'Sorry, you cannot kick me'
	} else if (user.id === interaction.guild.ownerId) {
		return 'Sorry, I cannot kick the owner'
	}

	// Validate permissions
	if ((interaction.memberPermissions.bitfield & PermissionFlagsBits.BanMembers) !== PermissionFlagsBits.BanMembers) {
		return 'You do not have permission to ban members'
	}

	// Get settings
	const { logsChannelId, testMode } = getSettings(interaction.guildId)

	// Do the actual kick - Sayonara!
	if (!testMode) {
		await interaction.guild.members.kick(user, reason)
		logger.info(`Kicked`, user, `for`, reason, `in guild`, interaction.guild.name)
	}

	// Prepare response embed fields
	const fields = [
		{
			name: 'Member',
			value: user.toString()
		},
		{
			name: 'Reason',
			value: reason || 'No reason provided'
		}
	]

	// This can be achieved by fetching all channels and then fetching the last n messages from each channel asynchronously
	if (deleteMessages) {
		fields.push({
			name: 'Messages Deleted',
			value: deleteMessages
		})
	}

	// Delete messages if requested in the background
	if (deleteMessages && !testMode) {
		deleteRecentUserMessages(interaction.guild, user.id)
	}

	// Prepare message payload
	const deleted = deleteMessagesOptions.find((option) => option.value === deleteMessages)?.name
	const messagePayload: CommandResult = {
		embeds: [
			{
				color: Colors.Red,
				title: `${user.username} was kicked`,
				thumbnail: {
					url: user.displayAvatarURL()
				},
				fields: [
					{
						name: 'Member',
						value: user.toString()
					},
					{
						name: 'Reason',
						value: reason ?? 'No reason provided'
					},
					{
						name: 'Messages Deleted',
						value: deleted ?? 'None'
					}
				]
			}
		]
	}

	// Log action to modlogs channel if this is not it
	if (interaction.channelId !== logsChannelId) {
		const testPrefix = testMode ? '[TEST] ' : ''
		await logAction(interaction.guildId, {
			embeds: [
				{
					title: testPrefix + `${user.username} was kicked`,
					thumbnail: {
						url: user.displayAvatarURL()
					},
					description: `${user} was kicked`,
					color: Colors.Red,
					timestamp: new Date().toISOString(),
					footer: {
						icon_url: interaction.user.displayAvatarURL(),
						text: 'by @' + interaction.user.username
					}
				}
			]
		})
	}

	// Test mode - don't actually kick
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
			],
			ephemeral: true
		}
	}

	// Send the message
	if (anonymous) {
		await interaction.channel?.send(messagePayload as MessageCreateOptions)

		return {
			content: 'Kick has been executed.',
			ephemeral: true
		}
	}

	return messagePayload
}

export const autocomplete = autocompleteDeleteMessages
