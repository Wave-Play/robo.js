import {
	ActionRowBuilder,
	ChatInputCommandInteraction,
	GuildMember,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle
} from 'discord.js'
import { createCommandConfig, Flashcore } from 'robo.js'

export const config = createCommandConfig({
	description: `Set the forum channel in which modmail will send the mails.`
})

export default async (interaction: ChatInputCommandInteraction) => {
	if (!interaction.guild) {
		return
	}

	const member = interaction.member as GuildMember
	if (!member.permissions.has('Administrator')) {
		return {
			content: 'You dont have administrator permission',
			ephemeral: true
		}
	}

	const title = (await Flashcore.get<string>(`rules-title`, { namespace: interaction.guild.id })) ?? ``
	const rules = (await Flashcore.get<string>(`rules-rules`, { namespace: interaction.guild.id })) ?? ``
	const imageurl = (await Flashcore.get<string>(`rules-imageurl`, { namespace: interaction.guild.id })) ?? ``

	const modal = new ModalBuilder().setCustomId('rulesmsg').setTitle('Rules Message')

	const one = new TextInputBuilder()
		.setCustomId('title')
		.setLabel('Embed title')
		.setMaxLength(400)
		.setPlaceholder('Server title')
		.setValue(title)
		.setRequired(true)
		.setStyle(TextInputStyle.Short)

	const two = new TextInputBuilder()
		.setCustomId('rules')
		.setLabel(`Embed description`)
		.setMaxLength(2000)
		.setPlaceholder('The rules')
		.setValue(rules)
		.setRequired(true)
		.setStyle(TextInputStyle.Paragraph)

	const three = new TextInputBuilder()
		.setCustomId('imageurl')
		.setLabel('Image URL for the rules embed (optional)')
		.setMaxLength(400)
		.setPlaceholder('Image link')
		.setValue(imageurl)
		.setRequired(false)
		.setStyle(TextInputStyle.Short)

	const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(one)
	const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(two)
	const thirdActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(three)

	modal.addComponents(firstActionRow, secondActionRow, thirdActionRow)

	await interaction.showModal(modal)

	return
}
