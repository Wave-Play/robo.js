import { createCommandConfig } from '@robojs/discordjs'
import type { ChatInputCommandInteraction } from 'discord.js'
import { Task } from '~/utils/models.js'
import { formatTaskLine } from '~/utils/format.js'

export const config = createCommandConfig({
	description: 'Search tasks with advanced filters',
	options: [
		{
			name: 'query',
			description: 'Search in title or description',
			type: 'string'
		},
		{
			name: 'priority',
			description: 'Filter by priority (comma-separated)',
			type: 'string'
		},
		{
			name: 'min-hours',
			description: 'Minimum estimated hours',
			type: 'number'
		},
		{
			name: 'max-hours',
			description: 'Maximum estimated hours',
			type: 'number'
		},
		{
			name: 'exclude-status',
			description: 'Exclude tasks with this status',
			type: 'string',
			choices: [
				{ name: 'Open', value: 'open' },
				{ name: 'In Progress', value: 'in_progress' },
				{ name: 'Done', value: 'done' }
			]
		},
		{
			name: 'page',
			description: 'Page number (10 per page)',
			type: 'integer'
		}
	]
})

export default async (interaction: ChatInputCommandInteraction) => {
	const query = interaction.options.getString('query')
	const priorityRaw = interaction.options.getString('priority')
	const minHours = interaction.options.getNumber('min-hours')
	const maxHours = interaction.options.getNumber('max-hours')
	const excludeStatus = interaction.options.getString('exclude-status')
	const page = interaction.options.getInteger('page') ?? 1
	const pageSize = 10

	const conditions: Record<string, unknown>[] = []

	// contains + OR across title and description
	if (query) {
		conditions.push({
			OR: [
				{ title: { contains: query } },
				{ description: { contains: query } }
			]
		})
	}

	// in operator for priority
	if (priorityRaw) {
		const priorities = priorityRaw.split(',').map((p) => p.trim())
		conditions.push({ priority: { in: priorities } })
	}

	// gte/lte for estimated hours
	if (minHours !== null) {
		conditions.push({ estimatedHours: { gte: minHours } })
	}
	if (maxHours !== null) {
		conditions.push({ estimatedHours: { lte: maxHours } })
	}

	// Exclude archived tasks
	conditions.push({ NOT: { archived: true } })

	// Exclude specific status
	if (excludeStatus) {
		conditions.push({ NOT: { status: excludeStatus } })
	}

	const where: Record<string, unknown> = {}
	if (conditions.length > 0) {
		where.AND = conditions
	}

	const tasks = await Task.findMany({
		where,
		select: { id: true, title: true, status: true, priority: true, estimatedHours: true },
		orderBy: { createdAt: 'asc' },
		take: pageSize,
		skip: (page - 1) * pageSize
	})

	if (tasks.length === 0) {
		return `No tasks found (page ${page}).`
	}

	const lines = tasks.map((t, i) => {
		const offset = (page - 1) * pageSize
		return formatTaskLine(t, offset + i)
	})
	return `**Search Results** (page ${page}):\n` + lines.join('\n')
}
