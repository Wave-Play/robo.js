import { define } from '@robojs/server'
import { z } from 'zod'
import { Label, Task } from '~/utils/models.js'

export const PATCH = define(
	{
		summary: 'Connect or disconnect a label from a task',
		tags: ['labels'],
		params: z.object({ id: z.string() }),
		body: z.object({
			taskId: z.string(),
			action: z.enum(['connect', 'disconnect'])
		})
	},
	async (request) => {
		const { id } = request.params
		const body = await request.json()

		const label = await Label.findUnique({ where: { id } })
		if (!label) {
			return new Response('Label not found', { status: 404 })
		}

		const task = await Task.findUnique({ where: { id: body.taskId } })
		if (!task) {
			return new Response('Task not found', { status: 404 })
		}

		if (body.action === 'connect') {
			await Label.update({
				where: { id },
				data: { tasks: { connect: body.taskId } } as Record<string, unknown>
			})
		} else {
			await Label.update({
				where: { id },
				data: { tasks: { disconnect: body.taskId } } as Record<string, unknown>
			})
		}

		return { success: true, action: body.action }
	}
)

export const DELETE = define(
	{
		summary: 'Delete a label',
		tags: ['labels'],
		params: z.object({ id: z.string() })
	},
	async (request) => {
		const label = await Label.delete({ where: { id: request.params.id } })
		if (!label) {
			return new Response('Not found', { status: 404 })
		}
		return { deleted: true }
	}
)
