import { createCommandConfig } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { Task } from '~/utils/models.js'

export const config = createCommandConfig({
	description: 'Archive a task',
	options: [
		{
			name: 'id',
			description: 'Task ID (first 8 chars is enough)',
			type: 'string',
			required: true
		},
		{
			name: 'reason',
			description: 'Reason for archiving',
			type: 'string'
		}
	]
})

export default async (interaction: ChatInputCommandInteraction) => {
	const idPrefix = interaction.options.getString('id', true)
	const reason = interaction.options.getString('reason')

	const tasks = await Task.findMany({ where: { id: { startsWith: idPrefix } }, take: 1 })
	const task = tasks[0]
	if (!task) {
		return `No task found matching ID \`${idPrefix}\`.`
	}

	const metadata = {
		...(task.metadata ?? {}),
		...(reason ? { notes: reason } : {})
	}

	await Task.update({
		where: { id: task.id },
		data: { archived: true, metadata }
	})

	return `Archived task **${task.title}**.` + (reason ? ` Reason: ${reason}` : '')
}
