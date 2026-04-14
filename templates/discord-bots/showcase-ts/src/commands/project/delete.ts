import { createCommandConfig } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { Project, Task } from '~/utils/models.js'

export const config = createCommandConfig({
	description: 'Delete a project and cascade-delete its tasks',
	options: [
		{
			name: 'name',
			description: 'Project name',
			type: 'string',
			required: true
		}
	]
})

export default async (interaction: ChatInputCommandInteraction) => {
	const name = interaction.options.getString('name', true)

	if (name === 'General') {
		return 'Cannot delete the default "General" project.'
	}

	const project = await Project.findFirst({ where: { name } })
	if (!project) {
		return `Project "${name}" not found.`
	}

	const taskCount = await Task.count({ where: { projectId: project.id } })
	await Project.delete({ where: { id: project.id } })

	return `Deleted project **${name}** and its ${taskCount} task(s) (cascade delete).`
}
