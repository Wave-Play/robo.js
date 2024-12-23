import testschema from '../../schemas/test.js'
import { PermissionFlagsBits } from 'discord.js'
import { createCommandConfig } from 'robo.js'

export const config = createCommandConfig({
	description: 'Remove data',
	defaultMemberPermissions: PermissionFlagsBits.Administrator
})

export default async (interaction) => {
	await interaction.deferReply()
	const data = await testschema.find()

	await Promise.all(
		data.map(async (d) => {
			await testschema.deleteOne({ name: d.name })
		})
	)

	await interaction.editReply({ content: `I deleted the values` })
}
