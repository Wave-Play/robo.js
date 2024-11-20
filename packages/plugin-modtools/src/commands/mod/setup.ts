import { Buttons, Selects } from '../../core/constants.js'
import { GuildSettings, getSettings } from '../../core/settings.js'
import { hasPermission } from '../../core/utils.js'
import { ButtonStyle, ChannelType, ComponentType, PermissionFlagsBits } from 'discord.js'
import { color, logger } from 'robo.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import type {
	BaseInteraction,
	ChatInputCommandInteraction,
	InteractionReplyOptions,
	MessageActionRowComponentData
} from 'discord.js'

export const config: CommandConfig = {
	defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
	dmPermission: false,
	description: `Sets up the moderation tools for the server`
}

/**
 * Sets up and configures the moderation tools for the server this command is run in.
 */
export default async (interaction: ChatInputCommandInteraction): Promise<CommandResult> => {
	// Get current settings
	if (!interaction.guildId) {
		return 'This command can only be run in a server'
	}

	// Validate permissions
	if (!hasPermission(interaction, 'ModerateMembers')) {
		logger.debug(`User @${interaction.user.username} does not have permission to run ${color.bold('/mod setup')}`)
		return {
			content: `You don't have permission to use this.`,
			ephemeral: true
		}
	}

	// Load settings and craft setup message
	const settings = getSettings(interaction.guildId)
	const setupMessage = createSetupMessage(interaction, settings)

	return {
		content: setupMessage.content,
		components: setupMessage.components
	}
}

export function createSetupMessage(interaction: BaseInteraction, settings: GuildSettings): InteractionReplyOptions {
	// Include extra info about moderator channels if they don't exist explaining what they are
	let extraInfo = ''

	/*if (settings.auditLogsChannelId) {
		const channel = interaction.guild?.channels?.cache?.get(settings.auditLogsChannelId)
		extraInfo += `- **Audit logs channel**: ${channel?.toString() ?? 'Unknown'}\n`
	} else {
		extraInfo += `- **Audit logs** are where all user actions are logged.\n`
	}*/

	if (settings.logsChannelId) {
		const channel = interaction.guild?.channels?.cache?.get(settings.logsChannelId)
		extraInfo += `- **Moderator logs channel**: ${channel?.toString() ?? 'Unknown'}\n`
	} else {
		extraInfo += `- **Moderator logs** are where all moderator actions are logged.\n`
	}

	if (settings.mailChannelId) {
		const channel = interaction.guild?.channels?.cache?.get(settings.mailChannelId)
		extraInfo += `- **Moderator mail channel**: ${channel?.toString() ?? 'Unknown'}\n`
	} else {
		extraInfo += `- **Moderator mail** is where users reports are sent.\n`
	}

	if (extraInfo) {
		extraInfo = `Channel settings:\n` + extraInfo + `\n`
	}

	// Action buttons
	const buttonComponents: MessageActionRowComponentData[] = [
		{
			type: ComponentType.Button,
			label: 'Test mode',
			style: settings.testMode ? ButtonStyle.Primary : ButtonStyle.Secondary,
			customId: Buttons.TestMode.id
		},
		{
			type: ComponentType.Button,
			label: 'Require confirmation',
			style: settings.requireConfirmation ? ButtonStyle.Primary : ButtonStyle.Secondary,
			customId: Buttons.RequireConfirmation.id
		},
		{
			type: ComponentType.Button,
			label: 'Lockdown mode',
			style: settings.lockdownMode ? ButtonStyle.Primary : ButtonStyle.Danger,
			customId: Buttons.LockdownMode.id
		}
	]

	if (!settings.logsChannelId || !settings.mailChannelId) {
		buttonComponents.unshift({
			type: ComponentType.Button,
			label: 'Create channels',
			style: ButtonStyle.Success,
			customId: Buttons.CreateChannels.id
		})
	} else {
		buttonComponents.push({
			type: ComponentType.Button,
			label: 'Reset settings',
			style: ButtonStyle.Danger,
			customId: Buttons.ResetSettings.id
		})
	}

	return {
		content: extraInfo + `Adjust your server's moderation settings here:\n\u200b`,
		components: [
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.ChannelSelect,
						channel_types: [ChannelType.GuildText],
						custom_id: Selects.ChannelLogs.id,
						max_values: 1,
						min_values: 1,
						placeholder: 'Select a channel for moderator logs'
					}
				]
			},
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.ChannelSelect,
						channel_types: [ChannelType.GuildText],
						custom_id: Selects.ChannelMail.id,
						max_values: 1,
						min_values: 1,
						placeholder: 'Select a channel for moderator mail'
					}
				]
			},
			/*{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.ChannelSelect,
						channel_types: [ChannelType.GuildText],
						custom_id: Selects.ChannelAudit.id,
						max_values: 1,
						min_values: 1,
						placeholder: 'Select a channel for audit logs'
					}
				]
			},*/
			{
				type: ComponentType.ActionRow,
				components: buttonComponents
			}
		]
	}
}
