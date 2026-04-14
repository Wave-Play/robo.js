import { createCommandConfig } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { Task, Project } from '~/utils/models.js'

export const config = createCommandConfig({
	description: 'Bulk import tasks from comma-separated titles',
	options: [
		{
			name: 'titles',
			description: 'Comma-separated task titles',
			type: 'string',
			required: true
		},
		{
			name: 'project',
			description: 'Project name (default: General)',
			type: 'string'
		}
	]
})

export default async (interaction: ChatInputCommandInteraction) => {
	const titlesRaw = interaction.options.getString('titles', true)
	const projectName = interaction.options.getString('project') ?? 'General'

	const project = await Project.findFirst({ where: { name: projectName } })
	if (!project) {
		return `Project "${projectName}" not found.`
	}

	const titles = titlesRaw.split(',').map((t) => t.trim()).filter(Boolean)
	if (titles.length === 0) {
		return 'No valid titles provided.'
	}

	const data = titles.map((title) => ({
		title,
		projectId: project.id,
		assigneeId: interaction.user.id
	}))

	const result = await Task.createMany({ data, skipDuplicates: true })
	return `Imported **${result.count}** task(s) into **${projectName}**.`
}
