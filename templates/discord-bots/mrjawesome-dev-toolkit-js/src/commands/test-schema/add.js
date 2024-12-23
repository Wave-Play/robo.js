import testschema from '../../schemas/test.js'
import { PermissionFlagsBits } from 'discord.js'
import { createCommandConfig } from 'robo.js'

export const config = createCommandConfig({
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
})

export default async (interaction, options) => {
	await interaction.deferReply()
	await testschema.create({
		Content: options['schema-input']
	})
	await interaction.editReply(`I saved the data`)
}
