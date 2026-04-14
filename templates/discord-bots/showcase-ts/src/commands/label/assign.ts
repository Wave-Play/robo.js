import { createCommandConfig } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { Task, Label } from '~/utils/models.js'

export const config = createCommandConfig({
	description: 'Assign a label to a task',
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
		},
		{
			name: 'replace',
			description: 'Replace all existing labels (set operation)',
			type: 'boolean'
		}
	]
})

export default async (interaction: ChatInputCommandInteraction) => {
	const taskIdPrefix = interaction.options.getString('task-id', true)
	const labelName = interaction.options.getString('label', true)
	const replace = interaction.options.getBoolean('replace') ?? false

	const tasks = await Task.findMany({ where: { id: { startsWith: taskIdPrefix } }, take: 1 })
	const task = tasks[0]
	if (!task) {
		return `No task found matching ID \`${taskIdPrefix}\`.`
	}

	const label = await Label.findFirst({ where: { name: labelName } })
	if (!label) {
		return `Label "${labelName}" not found. Create it first with \`/label create\`.`
	}

	if (replace) {
		// set operation — replaces all labels on the task
		await Label.update({
			where: { id: label.id },
			data: { tasks: { set: [task.id] } } as Record<string, unknown>
		})
		return `Set labels on **${task.title}** to just **${labelName}**.`
	}

	// connect operation — adds a label to the task
	await Label.update({
		where: { id: label.id },
		data: { tasks: { connect: task.id } } as Record<string, unknown>
	})
	return `Assigned label **${labelName}** to task **${task.title}**.`
}
