import testschema from '../../schemas/test.js'
import { PermissionFlagsBits } from 'discord.js'
import { createCommandConfig } from 'robo.js'
import type { ChatInputCommandInteraction } from 'discord.js'

export const config = createCommandConfig({
	description: 'Remove data',
	defaultMemberPermissions: PermissionFlagsBits.Administrator
} as const)

export default async (interaction: ChatInputCommandInteraction) => {
	const data = await testschema.find()

	await Promise.all(
		data.map(async (d: any) => {
			await testschema.deleteOne({ name: d.name })
		})
	)

	await interaction.reply({ content: `I deleted the values` })
}
