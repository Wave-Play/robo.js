import { define } from '@robojs/server'
import { z } from 'zod'
import { Task } from '~/utils/models.js'

export const GET = define(
	{
		summary: 'Search tasks with advanced filters',
		tags: ['tasks'],
		query: z.object({
			query: z.string().optional(),
			priority: z.string().optional(),
			minHours: z.string().optional(),
			maxHours: z.string().optional(),
			excludeStatus: z.string().optional(),
			page: z.string().optional(),
			limit: z.string().optional()
		})
	},
	async (request) => {
		const { query, priority, minHours, maxHours, excludeStatus, page, limit } = request.query
		const pageNum = page ? parseInt(page) : 1
		const pageSize = limit ? parseInt(limit) : 10
		const conditions: Record<string, unknown>[] = []

		if (query) {
			conditions.push({
				OR: [
					{ title: { contains: query } },
					{ description: { contains: query } }
				]
			})
		}

		if (priority) {
			const priorities = priority.split(',')
			conditions.push({ priority: { in: priorities } })
		}

		if (minHours) {
			conditions.push({ estimatedHours: { gte: parseFloat(minHours) } })
		}

		if (maxHours) {
			conditions.push({ estimatedHours: { lte: parseFloat(maxHours) } })
		}

		const where: Record<string, unknown> = {}
		if (excludeStatus) {
			where.NOT = { status: excludeStatus }
		}
		if (conditions.length > 0) {
			where.AND = conditions
		}

		const tasks = await Task.findMany({
			where: Object.keys(where).length > 0 ? where : undefined,
			orderBy: { createdAt: 'asc' },
			take: pageSize,
			skip: (pageNum - 1) * pageSize
		})

		return { tasks, page: pageNum, pageSize }
	}
)
