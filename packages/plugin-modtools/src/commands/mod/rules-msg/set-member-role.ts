import { ChatInputCommandInteraction, GuildMember } from 'discord.js'
import { createCommandConfig, Flashcore } from 'robo.js'
import type { CommandOptions } from 'robo.js'

export const config = createCommandConfig({
	description: `set the role members will be given afte accepting the rules`,
	options: [
		{
			name: 'role',
			description: 'select the role people will get from the rules button',
			type: 'role',
			required: true
		}
	]
} as const)

export default async (interaction: ChatInputCommandInteraction, options: CommandOptions<typeof config>) => {
	const { role } = options
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

	await Flashcore.set(`member-role`, role.name, { namespace: interaction.guild.id })
	return { content: `Member role set to ${role.name}` }
}
