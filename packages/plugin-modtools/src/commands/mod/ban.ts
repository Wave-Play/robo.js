import { Buttons, ID_NAMESPACE, autocompleteDeleteMessages, deleteMessagesOptions } from '../../core/constants.js'
import { getSettings } from '../../core/settings.js'
import { logAction, showConfirmation } from '../../core/utils.js'
import { Flashcore, logger } from 'robo.js'
import { ButtonStyle, Colors, ComponentType, PermissionFlagsBits } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import type { ChatInputCommandInteraction, MessageCreateOptions, ModalSubmitInteraction } from 'discord.js'

export const config: CommandConfig = {
	defaultMemberPermissions: PermissionFlagsBits.BanMembers,
	description: `Ban a member from the server`,
	dmPermission: false,
	options: [
		{
			name: 'member',
			description: 'The @member to ban',
			type: 'user',
			required: true
		},
		{
			name: 'reason',
			description: 'The reason for the ban',
			type: 'string'
		},
		{
			name: 'delete_messages',
			description: 'How much of their recent message history to delete',
			autocomplete: true
		},
		{
			name: 'duration',
			description: 'How long the ban should last',
			autocomplete: true
		},
		{
			name: 'anonymous',
			description: 'Whether to execute the ban anonymously',
			type: 'boolean'
		}
	]
}

export default async (interaction: ChatInputCommandInteraction): Promise<CommandResult> => {
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
		return 'Sorry, you cannot ban yourself'
	} else if (user.id === interaction.client.user?.id) {
		return 'Sorry, you cannot ban me'
	}

	// Get settings
	const { logsChannelId, requireConfirmation, testMode } = getSettings(interaction.guildId)

	// Validate permissions
	if ((interaction.memberPermissions.bitfield & PermissionFlagsBits.BanMembers) !== PermissionFlagsBits.BanMembers) {
		return 'You do not have permission to ban members'
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
	if (deleteMessages && !testMode) {
		fields.push({
			name: 'Messages Deleted',
			value: deleteMessages
		})
	}

	// Prepare message payload
	const deleted = deleteMessagesOptions.find((option) => option.value === deleteMessages)?.name
	const messagePayload: CommandResult = {
		embeds: [
			{
				color: Colors.DarkRed,
				title: `${user.username} was banned`,
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
		],
		components: [
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.Button,
						label: 'Unban',
						style: ButtonStyle.Danger,
						customId: Buttons.Unban.id + '/' + user.id
					}
				]
			}
		]
	}

	// Do the actual ban - Farewell forever!
	const execute = async (interaction: ChatInputCommandInteraction | ModalSubmitInteraction) => {
		logger.warn(`Interaction:`, interaction)
		if (!testMode) {
			await interaction.guild?.members.ban(user, { reason })
			await Flashcore.set(
				'ban',
				{
					reason: reason
				},
				{
					namespace: ID_NAMESPACE + interaction.guildId + user.id
				}
			)
			logger.info(
				`Banned @${user.username} for ${reason} in guild ${interaction.guild?.name} by @${interaction.user.username}`
			)
		}

		// Log action to modlogs channel if this is not it
		if (interaction.channelId !== logsChannelId) {
			const testPrefix = testMode ? '[TEST] ' : ''
			logAction(interaction.guildId, {
				embeds: [
					{
						title: testPrefix + `Member banned`,
						thumbnail: {
							url: user.displayAvatarURL()
						},
						description: `${user} has been banned`,
						color: Colors.DarkRed,
						timestamp: new Date().toISOString(),
						footer: {
							icon_url: interaction.user.displayAvatarURL(),
							text: 'by @' + interaction.user.username
						}
					}
				]
			})
		}

		interaction.reply({
			embeds: messagePayload.embeds,
			components: [
				{
					type: ComponentType.ActionRow,
					components: [
						{
							type: ComponentType.Button,
							label: 'Unban',
							style: ButtonStyle.Danger,
							customId: Buttons.Unban.id + '/' + user.id
						}
					]
				}
			]
		})
	}

	// Test mode - don't execute ban
	const test = (interaction: ModalSubmitInteraction | ChatInputCommandInteraction) => {
		if (testMode) {
			interaction.reply({
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
			})
			return true
		}
	}

	// Show confirmation modal if required
	if (requireConfirmation) {
		await showConfirmation(interaction, (interaction: ModalSubmitInteraction) => {
			if (!test(interaction)) {
				execute(interaction)
			}
		})
		return
	}

	if (test(interaction)) {
		return
	}
	execute(interaction)

	if (anonymous) {
		interaction.channel?.send(messagePayload as MessageCreateOptions)

		return {
			content: 'Ban has been executed.',
			ephemeral: true
		}
	}

	return messagePayload
}

export const autocomplete = autocompleteDeleteMessages
