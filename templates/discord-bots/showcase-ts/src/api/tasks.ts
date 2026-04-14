import { define } from '@robojs/server'
import { z } from 'zod'
import { Task } from '~/utils/models.js'

export const GET = define(
	{
		summary: 'List all tasks',
		tags: ['tasks'],
		query: z.object({
			status: z.string().optional(),
			limit: z.string().optional()
		}),
		response: {
			200: z.object({
				tasks: z.array(
					z.object({
						id: z.string(),
						title: z.string(),
						status: z.string(),
						priority: z.string()
					})
				)
			})
		}
	},
	async (request) => {
		const { status, limit } = request.query
		const tasks = await Task.findMany({
			where: status ? { status: status as 'open' | 'in_progress' | 'done' } : undefined,
			take: limit ? parseInt(limit) : 20
		})
		return { tasks }
	}
)
