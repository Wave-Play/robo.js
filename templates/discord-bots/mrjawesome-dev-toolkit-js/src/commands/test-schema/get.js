import testschema from '../../schemas/test.js'
import { PermissionFlagsBits } from 'discord.js'
import { createCommandConfig } from 'robo.js'

export const config = createCommandConfig({
	description: 'Get data',
	defaultMemberPermissions: PermissionFlagsBits.Administrator
})

export default async (interaction) => {
	await interaction.deferReply()
	const data = await testschema.find()
	let values = []
	data.forEach(async (d) => {
		values.push(d.Content)
	})

	await interaction.editReply({
		content: `${values.join('\n') || 'No content found'}`
	})
}
