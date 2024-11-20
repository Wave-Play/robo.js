import { getSettings } from '../../core/settings.js'
import { hasPermission, logAction } from '../../core/utils.js'
import { Colors, PermissionFlagsBits } from 'discord.js'
import { logger, color, Flashcore } from 'robo.js'
import type { CommandConfig, CommandResult } from 'robo.js'
import type { APIEmbedField, CommandInteraction, GuildMember, MessageCreateOptions } from 'discord.js'

export const config: CommandConfig = {
	defaultMemberPermissions: PermissionFlagsBits.ModerateMembers,
	dmPermission: false,
	description: `Warns a member and adds a strike`,
	options: [
		{
			name: 'member',
			description: 'The @member to warn',
			type: 'user',
			required: true
		},
		{
			name: 'reason',
			description: 'The reason for the warn',
			required: true
		},
		{
			name: 'message',
			description: 'The message ID that triggered the warn'
		},
		{
			name: 'anonymous',
			description: 'Whether to send the warning anonymously',
			type: 'boolean'
		}
	]
}

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
	const anonymous = (interaction.options.get('anonymous')?.value as boolean) ?? false
	const member = interaction.options.get('member')?.member as GuildMember
	const message = interaction.options.get('message')?.value as string
	const reason = interaction.options.get('reason')?.value as string

	// Validate permissions
	if (!hasPermission(interaction, 'ModerateMembers')) {
		logger.debug(`User @${interaction.user.username} does not have permission to run ${color.bold('/mod warn')}`)
		return {
			content: `You don't have permission to use this.`,
			ephemeral: true
		}
	}

	let messageLink = ''
	if (message) {
		messageLink = `https://discord.com/channels/${interaction.guild?.id}/${interaction.channel?.id}/${message}`
	}

	const fields: APIEmbedField[] = [
		{
			name: 'Reason',
			value: reason
		}
	]
	if (messageLink) {
		fields.push({
			name: 'Message',
			value: messageLink
		})
	}

	// Get current infractions
	const infractions =
		(await Flashcore.get<number>('infractions', {
			namespace: interaction.guildId + member.id
		})) ?? 0
	const newInfractions = infractions + 1
	const plural = infractions === 1 ? '' : 's'

	// Prepare message payload
	const messagePayload: CommandResult = {
		content: member.toString(),
		embeds: [
			{
				title: `You've been warned`,
				thumbnail: {
					url: member.displayAvatarURL()
				},
				color: Colors.Yellow,
				fields: fields,
				footer: {
					text: `⚠️ You now have ${infractions} infraction${plural}.`
				}
			}
		]
	}

	// Log action to modlogs channel if this is not it
	const { logsChannelId, testMode } = getSettings(interaction.guildId)
	if (interaction.channelId !== logsChannelId) {
		const testPrefix = testMode ? '[TEST] ' : ''
		logAction(interaction.guildId, {
			embeds: [
				{
					title: testPrefix + 'Member warned',
					description: `${member} has been warned`,
					thumbnail: {
						url: member.displayAvatarURL()
					},
					color: Colors.Yellow,
					fields: fields,
					timestamp: new Date().toISOString(),
					footer: {
						icon_url: interaction.user.displayAvatarURL(),
						text: 'by @' + interaction.user.username
					}
				}
			]
		})
	}

	// Test mode - don't send warning
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

	// Add infraction to member
	await Flashcore.set('infractions', newInfractions, {
		namespace: interaction.guildId + member.id
	})

	if (anonymous) {
		await interaction.channel?.send(messagePayload as MessageCreateOptions)

		return {
			content: 'Warning has been sent.',
			ephemeral: true
		}
	}

	return messagePayload
}
