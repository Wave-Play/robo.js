import type { PrefixCommandConfig, PrefixCommandArgs } from '@robojs/discordjs'
import type { Message } from 'discord.js'
import { Task } from '~/utils/models.js'
import { formatTaskLine } from '~/utils/format.js'

export const config: PrefixCommandConfig = {
	description: 'List your open tasks',
	aliases: ['t', 'mytasks'],
	cooldown: 5000,
	sage: { typing: true }
}

export default async function (message: Message, args: PrefixCommandArgs) {
	const tasks = await Task.findMany({
		where: { assigneeId: message.author.id, status: 'open' },
		orderBy: { createdAt: 'desc' },
		take: 5
	})

	if (tasks.length === 0) {
		return 'No open tasks assigned to you.'
	}

	return tasks.map((t, i) => formatTaskLine(t, i)).join('\n')
}
