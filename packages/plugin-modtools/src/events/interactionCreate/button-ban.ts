import { Buttons, ID_NAMESPACE } from '../../core/constants.js'
import { getSettings } from '../../core/settings.js'
import { hasPermission, logAction } from '../../core/utils.js'
import { Flashcore, logger } from 'robo.js'
import { ButtonStyle, Colors, ComponentType } from 'discord.js'
import type { EventConfig } from 'robo.js'
import type { ButtonInteraction } from 'discord.js'

export const config: EventConfig = {
	description: `Bans a user when clicked`
}

export default async (interaction: ButtonInteraction) => {
	// Only handle interaction meant for this file
	if (!interaction.isButton() || !interaction.customId.startsWith(Buttons.Ban.id)) {
		return
	}
	await interaction.deferUpdate()

	// Validate the event
	if (!interaction.guild) {
		return 'This command can only be used in a server'
	}

	// Get settings
	const { logsChannelId, testMode } = getSettings(interaction.guildId)

	// Validate permissions
	if (!hasPermission(interaction, 'BanMembers')) {
		logger.debug(`User @${interaction.user.username} does not have permission to unban users`)
		return interaction.followUp({
			content: `You don't have permission to use this.`,
			ephemeral: true
		})
	}

	// Do the actual ban - Farewell forever!
	const parts = interaction.customId.split('/')
	const userId = parts[parts.length - 1]

	if (!testMode) {
		await interaction.guild.members.ban(userId)
		await Flashcore.set(
			'ban',
			{},
			{
				namespace: ID_NAMESPACE + interaction.guildId + userId
			}
		)
		logger.info(`Banned <@${userId}> in guild ${interaction.guild.name} by @${interaction.user.username}`)
	}

	// Get user data
	const user = await interaction.client.users.fetch(userId)

	// Log action to modlogs channel
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

	// Test mode - don't execute ban
	if (testMode) {
		return interaction.followUp({
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
	}

	return interaction.followUp({
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
	})
}
