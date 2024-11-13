import { EmbedBuilder, ModalSubmitInteraction } from 'discord.js'
import { Flashcore } from 'robo.js'

export default async (interaction: ModalSubmitInteraction) => {
	if (!interaction.guild) return

	if (interaction.isModalSubmit()) {
		if (interaction.customId === 'rulesmsg') {
			const title = interaction.fields.getTextInputValue('title') as string
			const rules = interaction.fields.getTextInputValue('rules') as string
			const imageurl = interaction.fields.getTextInputValue('imageurl') as string

			await Flashcore.set<string>(`rules-title`, title, { namespace: interaction.guild.id })
			await Flashcore.set<string>(`rules-rules`, rules, { namespace: interaction.guild.id })
			await Flashcore.set<string>(`rules-imageurl`, imageurl, { namespace: interaction.guild.id })

			const embed = new EmbedBuilder()

			embed.setTitle(`${title} - Example rules message`).setColor(`Blurple`).setDescription(`${rules}`)

			if (imageurl) {
				embed.setImage(imageurl)
			}

			return interaction.reply({ embeds: [embed] })
		}
	} else return
}
