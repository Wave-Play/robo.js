import testschema from '../../schemas/test.js'
import { PermissionFlagsBits } from 'discord.js'

export const config = {
	description: 'Get data',
	defaultMemberPermissions: PermissionFlagsBits.Administrator
}

export default async (interaction) => {
	const data = await testschema.find()
	let values = []
	data.forEach(async (d) => {
		values.push(d.Content)
	})

	await interaction.reply({
		content: `${values.join('\n') || 'No content found'}`
	})
}
