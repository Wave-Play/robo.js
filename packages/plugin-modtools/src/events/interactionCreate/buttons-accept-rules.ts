import { Flashcore } from 'robo.js'
import { ButtonInteraction, GuildMember, Role } from 'discord.js'

export default async (interaction: ButtonInteraction) => {
	if (interaction.isButton()) {
		const i = interaction as ButtonInteraction

		if (i.customId === 'rulesaccept') {
			const member = interaction.member as GuildMember
			const rolestring = await Flashcore.get<string>(`member-role`, { namespace: interaction.guild!.id })
			if (member.roles.cache.some((role) => role.name === rolestring)) {
				return interaction.reply({
					content: `you already have accepted the rules`,
					ephemeral: true
				})
			} else {
				const role = interaction.guild!.roles.cache.find((role) => role.name === rolestring) as Role
				await member.roles.add(role)
				return interaction.reply({
					content: `you have now accepted the rules`,
					ephemeral: true
				})
			}
		}
	}
}
