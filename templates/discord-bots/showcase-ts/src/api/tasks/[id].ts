import { define } from '@robojs/server'
import { z } from 'zod'
import { Task } from '~/utils/models.js'

export const GET = define(
	{
		summary: 'Get a task by ID',
		tags: ['tasks'],
		params: z.object({
			id: z.string()
		}),
		response: {
			200: z.object({
				id: z.string(),
				title: z.string(),
				status: z.string(),
				priority: z.string(),
				projectId: z.string()
			})
		}
	},
	async (request) => {
		const task = await Task.findUnique({ where: { id: request.params.id } })
		if (!task) {
			return new Response('Not found', { status: 404 })
		}
		return task
	}
)

export const PATCH = define(
	{
		summary: 'Update a task',
		tags: ['tasks'],
		params: z.object({
			id: z.string()
		}),
		body: z.object({
			title: z.string().optional(),
			status: z.enum(['open', 'in_progress', 'done']).optional(),
			priority: z.enum(['low', 'medium', 'high']).optional(),
			description: z.string().optional()
		})
	},
	async (request) => {
		const data = await request.json()
		const task = await Task.update({
			where: { id: request.params.id },
			data
		})
		if (!task) {
			return new Response('Not found', { status: 404 })
		}
		return task
	}
)

export const DELETE = define(
	{
		summary: 'Delete a task',
		tags: ['tasks'],
		params: z.object({
			id: z.string()
		})
	},
	async (request) => {
		const task = await Task.delete({ where: { id: request.params.id } })
		if (!task) {
			return new Response('Not found', { status: 404 })
		}
		return { deleted: true }
	}
)
