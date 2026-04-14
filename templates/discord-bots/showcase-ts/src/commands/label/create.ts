import { createCommandConfig } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { UniqueConstraintError } from 'robo.js/flashcore'
import { Label } from '~/utils/models.js'

export const config = createCommandConfig({
	description: 'Create a new label',
	options: [
		{
			name: 'name',
			description: 'Label name',
			type: 'string',
			required: true
		},
		{
			name: 'color',
			description: 'Label color (hex, e.g. #ff0000)',
			type: 'string'
		}
	]
})

export default async (interaction: ChatInputCommandInteraction) => {
	const name = interaction.options.getString('name', true)
	const color = interaction.options.getString('color') ?? '#808080'

	try {
		const label = await Label.create({ name, color })
		return `Created label **${label.name}** with color \`${label.color}\`.`
	} catch (err) {
		if (err instanceof UniqueConstraintError) {
			return `Label "${name}" already exists.`
		}
		throw err
	}
}
