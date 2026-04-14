import { createCommandConfig } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { Task } from '~/utils/models.js'
import { formatTaskLine } from '~/utils/format.js'

export const config = createCommandConfig({
	description: 'List tasks',
	options: [
		{
			name: 'status',
			description: 'Filter by status',
			type: 'string',
			choices: [
				{ name: 'Open', value: 'open' },
				{ name: 'In Progress', value: 'in_progress' },
				{ name: 'Done', value: 'done' }
			]
		},
		{
			name: 'assignee',
			description: 'Filter by assignee',
			type: 'user'
		}
	]
})

export default async (interaction: ChatInputCommandInteraction) => {
	const status = interaction.options.getString('status') as 'open' | 'in_progress' | 'done' | null
	const assignee = interaction.options.getUser('assignee')

	const where: Record<string, unknown> = {}
	if (status) where.status = status
	if (assignee) where.assigneeId = assignee.id

	const tasks = await Task.findMany({
		where: Object.keys(where).length > 0 ? where : undefined,
		orderBy: { createdAt: 'desc' },
		take: 10
	})

	if (tasks.length === 0) {
		return 'No tasks found.'
	}

	const lines = tasks.map((t, i) => formatTaskLine(t, i))
	return lines.join('\n')
}
