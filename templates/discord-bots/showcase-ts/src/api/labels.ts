import { define } from '@robojs/server'
import { z } from 'zod'
import { Label } from '~/utils/models.js'

export const GET = define(
	{
		summary: 'List all labels',
		tags: ['labels'],
		response: {
			200: z.object({
				labels: z.array(z.object({
					id: z.string(),
					name: z.string(),
					color: z.string()
				}))
			})
		}
	},
	async () => {
		const labels = await Label.findMany({ orderBy: { name: 'asc' } })
		return { labels }
	}
)

export const POST = define(
	{
		summary: 'Create a label',
		tags: ['labels'],
		body: z.object({
			name: z.string(),
			color: z.string().optional()
		})
	},
	async (request) => {
		const body = await request.json()
		const label = await Label.create({ name: body.name, color: body.color ?? '#808080' })
		return label
	}
)
