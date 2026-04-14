import { createCommandConfig } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { Task, Project } from '~/utils/models.js'

export const config = createCommandConfig({
	description: 'Create or update a task by title',
	options: [
		{
			name: 'title',
			description: 'Task title',
			type: 'string',
			required: true
		},
		{
			name: 'project',
			description: 'Project name (default: General)',
			type: 'string'
		},
		{
			name: 'description',
			description: 'Task description',
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
		}
	]
})

export default async (interaction: ChatInputCommandInteraction) => {
	const title = interaction.options.getString('title', true)
	const projectName = interaction.options.getString('project') ?? 'General'
	const description = interaction.options.getString('description') ?? undefined
	const priority = (interaction.options.getString('priority') ?? undefined) as 'low' | 'medium' | 'high' | undefined

	const project = await Project.findFirst({ where: { name: projectName } })
	if (!project) {
		return `Project "${projectName}" not found.`
	}

	// Find existing task with same title in project
	const existing = await Task.findFirst({ where: { title, projectId: project.id } })

	if (existing) {
		const updateData: Record<string, unknown> = {}
		if (description !== undefined) updateData.description = description
		if (priority !== undefined) updateData.priority = priority
		await Task.update({ where: { id: existing.id }, data: updateData })
		return `Updated existing task **${title}** in **${projectName}**.`
	}

	const task = await Task.create({
		title,
		description,
		priority: priority ?? 'medium',
		projectId: project.id,
		assigneeId: interaction.user.id
	})
	return `Created new task **${task.title}** (ID: \`${task.id.slice(0, 8)}\`) in **${projectName}**.`
}
