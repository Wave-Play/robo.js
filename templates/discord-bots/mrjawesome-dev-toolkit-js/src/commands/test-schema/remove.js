import testschema from '../../schemas/test.js'
import { PermissionFlagsBits } from 'discord.js'

export const config = {
	description: 'Remove data',
	defaultMemberPermissions: PermissionFlagsBits.Administrator
}

export default async (interaction) => {
	const data = await testschema.find()

	await Promise.all(
		data.map(async (d) => {
			await testschema.deleteOne({ name: d.name })
		})
	)

	await interaction.reply({ content: `I deleted the values` })
}
