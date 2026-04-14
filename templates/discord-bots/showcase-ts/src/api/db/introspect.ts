import { define } from '@robojs/server'
import { Flashcore } from 'robo.js'

export const GET = define(
	{
		summary: 'Get database introspection data',
		tags: ['db']
	},
	async () => {
		const introspection = await Flashcore.$.introspect()
		return introspection
	}
)
