import { createCommandConfig } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { Task, Label } from '~/utils/models.js'

export const config = createCommandConfig({
	description: 'Remove a label from a task',
	options: [
		{
			name: 'task-id',
			description: 'Task ID (first 8 chars is enough)',
			type: 'string',
			required: true
		},
		{
			name: 'label',
			description: 'Label name',
			type: 'string',
			required: true
		}
	]
})

export default async (interaction: ChatInputCommandInteraction) => {
	const taskIdPrefix = interaction.options.getString('task-id', true)
	const labelName = interaction.options.getString('label', true)

	const tasks = await Task.findMany({ where: { id: { startsWith: taskIdPrefix } }, take: 1 })
	const task = tasks[0]
	if (!task) {
		return `No task found matching ID \`${taskIdPrefix}\`.`
	}

	const label = await Label.findFirst({ where: { name: labelName } })
	if (!label) {
		return `Label "${labelName}" not found.`
	}

	await Label.update({
		where: { id: label.id },
		data: { tasks: { disconnect: task.id } } as Record<string, unknown>
	})
	return `Removed label **${labelName}** from task **${task.title}**.`
}
