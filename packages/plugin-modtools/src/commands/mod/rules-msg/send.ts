import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChatInputCommandInteraction,
	EmbedBuilder,
	GuildMember
} from 'discord.js'
import { createCommandConfig, Flashcore } from 'robo.js'
import type { CommandOptions } from 'robo.js'

export const config = createCommandConfig({
	description: `Sends the Rules message with IAccept button to the channel where used`,
	options: [
		{
			name: 'button-text',
			description: 'The text on the button',
			type: 'string',
			required: false
		}
	]
} as const)

export default async (interaction: ChatInputCommandInteraction, options: CommandOptions<typeof config>) => {
	const button = options['button-text'] ?? 'I Accept'
	const guild = interaction.guild
	if (!guild) {
		return
	}

	const member = interaction.member as GuildMember

	if (!member.permissions.has('Administrator')) {
		return {
			content: 'You dont have administrator permission',
			ephemeral: true
		}
	}

	const title = await Flashcore.get<string>(`rules-title`, { namespace: interaction.guild.id })
	const rules = await Flashcore.get<string>(`rules-rules`, { namespace: interaction.guild.id })
	const imageurl = (await Flashcore.get<string>(`rules-imageurl`, { namespace: interaction.guild.id })) ?? `null`
	const rolestring = await Flashcore.get(`member-role`, { namespace: interaction.guild.id })

	if (!title || !rules) {
		return {
			content: 'Set the message content first using `/mod rules-msg set-rules`',
			ephemeral: true
		}
	}
	if (!rolestring) {
		return {
			content: 'Set the member role first using `/mod rules-msg set-member-role`',
			ephemeral: true
		}
	}

	await Flashcore.set(`rules-channel`, interaction.channel!.id, { namespace: interaction.guild.id })

	const channel = guild.channels.cache.get(interaction.channelId)
	const embed = new EmbedBuilder()

	if (!channel || !channel.isTextBased) return

	embed.setTitle(title).setColor(`Blurple`).setDescription(rules)

	if (imageurl) {
		embed.setImage(imageurl)
	}

	const cancel = new ButtonBuilder().setCustomId('rulesaccept').setLabel(button).setStyle(ButtonStyle.Primary)

	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(cancel)

	// @ts-expect-error - Assume channel can send
	channel.send({ embeds: [embed], components: [row] })
	return {
		content: 'Sent',
		ephemeral: true
	}
}
