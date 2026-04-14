import { createCommandConfig } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { Task, Project } from '~/utils/models.js'

export const config = createCommandConfig({
	description: 'Add a new task',
	options: [
		{
			name: 'title',
			description: 'Task title',
			type: 'string',
			required: true
		},
		{
			name: 'project',
			description: 'Project name',
			type: 'string'
		},
		{
			name: 'priority',
			description: 'Task priority',
			type: 'string',
			choices: [
				{ name: 'Low', value: 'low' },
				{ name: 'Medium', value: 'medium' },
				{ name: 'High', value: 'high' }
			]
		},
		{
			name: 'description',
			description: 'Task description',
			type: 'string'
		}
	]
})

export default async (interaction: ChatInputCommandInteraction) => {
	const title = interaction.options.getString('title', true)
	const projectName = interaction.options.getString('project') ?? 'General'
	const priority = (interaction.options.getString('priority') ?? 'medium') as 'low' | 'medium' | 'high'
	const description = interaction.options.getString('description') ?? undefined

	const project = await Project.findFirst({ where: { name: projectName } })
	if (!project) {
		return `Project "${projectName}" not found. Create it first with \`/project create\`.`
	}

	const task = await Task.create({
		title,
		description,
		priority,
		projectId: project.id,
		assigneeId: interaction.user.id
	})

	return `Created task **${task.title}** (ID: \`${task.id.slice(0, 8)}\`) in project **${projectName}**.`
}
