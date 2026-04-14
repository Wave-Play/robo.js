import type { UserContextMenuCommandInteraction, User } from 'discord.js'
import { Task } from '~/utils/models.js'
import { formatTaskLine } from '~/utils/format.js'

export default async (interaction: UserContextMenuCommandInteraction, user: User) => {
	const tasks = await Task.findMany({
		where: { assigneeId: user.id },
		orderBy: { createdAt: 'desc' },
		take: 5
	})

	if (tasks.length === 0) {
		return `${user} has no tasks assigned.`
	}

	const lines = [`**Tasks for ${user}:**`, ...tasks.map((t, i) => formatTaskLine(t, i))]
	return lines.join('\n')
}
