import { createCommandConfig } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { Task } from '~/utils/models.js'
import { formatTaskLine } from '~/utils/format.js'

export const config = createCommandConfig({
	description: 'View a task by ID',
	options: [
		{
			name: 'id',
			description: 'Task ID (first 8 chars is enough)',
			type: 'string',
			required: true
		}
	]
})

export default async (interaction: ChatInputCommandInteraction) => {
	const idPrefix = interaction.options.getString('id', true)

	const tasks = await Task.findMany({ where: { id: { startsWith: idPrefix } }, take: 1, include: { project: true } })
	const task = tasks[0]
	if (!task) {
		return `No task found matching ID \`${idPrefix}\`.`
	}

	const project = (task as Record<string, unknown>).project as { name: string } | undefined
	const lines = [
		formatTaskLine(task),
		`**ID:** \`${task.id}\``,
		`**Project:** ${project?.name ?? 'Unknown'}`,
		task.description ? `**Description:** ${task.description}` : null,
		task.assigneeId ? `**Assigned to:** <@${task.assigneeId}>` : '**Unassigned**'
	]

	return lines.filter(Boolean).join('\n')
}
