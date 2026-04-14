import { createCommandConfig } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { Task } from '~/utils/models.js'

export const config = createCommandConfig({
	description: 'Assign a task to a user',
	options: [
		{
			name: 'id',
			description: 'Task ID (first 8 chars is enough)',
			type: 'string',
			required: true
		},
		{
			name: 'user',
			description: 'User to assign the task to',
			type: 'user',
			required: true
		}
	]
})

export default async (interaction: ChatInputCommandInteraction) => {
	const idPrefix = interaction.options.getString('id', true)
	const user = interaction.options.getUser('user', true)

	const tasks = await Task.findMany({ where: { id: { startsWith: idPrefix } }, take: 1 })
	const task = tasks[0]
	if (!task) {
		return `No task found matching ID \`${idPrefix}\`.`
	}

	await Task.update({ where: { id: task.id }, data: { assigneeId: user.id } })
	return `Assigned **${task.title}** to ${user}.`
}
