import { define } from '../../src/core/typed-endpoint.js'
import { z } from 'zod'

export const POST = define(
	{
		summary: 'Test endpoint',
		tags: ['test'],
		body: z.object({ name: z.string() }),
		response: {
			200: z.object({ success: z.boolean() })
		}
	},
	async () => ({ success: true })
)
