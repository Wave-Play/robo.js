import testschema from '../../schemas/test.js'
import { PermissionFlagsBits } from 'discord.js'

export const config = {
	description: 'Add data',
	defaultMemberPermissions: PermissionFlagsBits.Administrator,
	options: [
		{
			name: 'schema-input',
			description: 'text to save',
			type: 'string',
			required: true
		}
	]
}

export default async (interaction, options) => {
	await testschema.create({
		Content: options['schema-input']
	})
	await interaction.reply(`I saved the data`)
}
