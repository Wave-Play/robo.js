import { createCommandConfig } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { UniqueConstraintError } from 'robo.js/flashcore'
import { Project } from '~/utils/models.js'

export const config = createCommandConfig({
	description: 'Create a new project',
	options: [
		{
			name: 'name',
			description: 'Project name',
			type: 'string',
			required: true
		},
		{
			name: 'description',
			description: 'Project description',
			type: 'string'
		}
	]
})

export default async (interaction: ChatInputCommandInteraction) => {
	const name = interaction.options.getString('name', true)
	const description = interaction.options.getString('description') ?? undefined

	try {
		const project = await Project.create({ name, description })
		return `Created project **${project.name}**.`
	} catch (err) {
		if (err instanceof UniqueConstraintError) {
			return `Project "${name}" already exists.`
		}
		throw err
	}
}
