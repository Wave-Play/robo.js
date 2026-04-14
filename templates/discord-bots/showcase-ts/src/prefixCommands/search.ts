import type { PrefixCommandConfig, PrefixCommandArgs } from '@robojs/discordjs'
import type { Message } from 'discord.js'
import { Task } from '~/utils/models.js'
import { formatTaskLine } from '~/utils/format.js'

export const config: PrefixCommandConfig = {
	description: 'Search tasks by keyword',
	args: [
		{
			name: 'query',
			description: 'Search keyword',
			required: true
		}
	]
}

export default async function (message: Message, args: PrefixCommandArgs) {
	const query = args.params.query
	if (!query) {
		return 'Usage: `!search <keyword>`'
	}

	const tasks = await Task.findMany({
		where: { title: { contains: query } },
		take: 5,
		orderBy: { createdAt: 'desc' }
	})

	if (tasks.length === 0) {
		return `No tasks matching "${query}".`
	}

	const lines = tasks.map((t, i) => formatTaskLine(t, i))
	return `**Search: "${query}"**\n` + lines.join('\n')
}
