import testschema from '../../schemas/test.js'
import { PermissionFlagsBits } from 'discord.js'
import { createCommandConfig } from 'robo.js'
import type { ChatInputCommandInteraction } from 'discord.js'

export const config = createCommandConfig({
	description: 'Get data',
	defaultMemberPermissions: PermissionFlagsBits.Administrator
} as const)

export default async (interaction: ChatInputCommandInteraction) => {
	const data = await testschema.find()
	let values: string[] = []
	data.forEach(async (d) => {
		values.push(d.Content!)
	})

	await interaction.reply({
		content: `${values.join('\n') || 'No content found'}`
	})
}
