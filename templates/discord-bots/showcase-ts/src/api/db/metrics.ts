import { define } from '@robojs/server'
import { Flashcore } from 'robo.js'

export const GET = define(
	{
		summary: 'Get database metrics',
		tags: ['db']
	},
	async () => {
		const metrics = Flashcore.$.metrics()
		return metrics
	}
)

export const POST = define(
	{
		summary: 'Reset database metrics',
		tags: ['db']
	},
	async () => {
		Flashcore.$.resetMetrics()
		return { reset: true }
	}
)
