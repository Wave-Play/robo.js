import type { Message } from 'discord.js'
import { Task } from '~/utils/models.js'
import { formatTaskLine } from '~/utils/format.js'

const TASK_REF_PATTERN = /#T-([a-zA-Z0-9]+)/g

export default async (message: Message) => {
	if (message.author.bot) return

	const matches = [...message.content.matchAll(TASK_REF_PATTERN)]
	if (matches.length === 0) return

	const lines: string[] = []
	for (const match of matches) {
		const idPrefix = match[1]
		const tasks = await Task.findMany({ where: { id: { startsWith: idPrefix } }, take: 1 })
		const task = tasks[0]
		if (task) {
			lines.push(formatTaskLine(task))
		}
	}

	if (lines.length > 0) {
		await message.reply(lines.join('\n'))
	}
}
