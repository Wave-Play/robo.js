import testschema from '../../schemas/test.js'
import { PermissionFlagsBits } from 'discord.js'
import { CommandOptions, createCommandConfig } from 'robo.js'
import type { ChatInputCommandInteraction } from 'discord.js'

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
} as const)

export default async (interaction: ChatInputCommandInteraction, options: CommandOptions<typeof config>) => {
	await testschema.create({
		Content: options['schema-input']
	})
	await interaction.reply(`I saved the data`)
}
