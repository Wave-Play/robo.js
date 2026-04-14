import type { PrefixCommandConfig, PrefixCommandArgs } from '@robojs/discordjs'
import type { Message } from 'discord.js'
import { Task } from '~/utils/models.js'

export const config: PrefixCommandConfig = {
	description: 'Mark a task as done by ID',
	args: [
		{ name: 'id', description: 'Task ID', required: true }
	]
}

export default async function (message: Message, args: PrefixCommandArgs) {
	const idPrefix = args.params.id
	if (!idPrefix) {
		return 'Usage: `!done <task-id>`'
	}

	const tasks = await Task.findMany({ where: { id: { startsWith: idPrefix } }, take: 1 })
	const task = tasks[0]
	if (!task) {
		return `No task found matching ID \`${idPrefix}\`.`
	}

	if (task.status === 'done') {
		return `Task **${task.title}** is already done.`
	}

	await Task.update({ where: { id: task.id }, data: { status: 'done' } })
	return `Marked **${task.title}** as done!`
}
