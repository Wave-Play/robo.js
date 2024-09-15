import { initTRPC } from '@robojs/trpc'
import { z } from 'zod'

const t = initTRPC.create()
export const router = t.router
export const procedure = t.procedure

export const appRouter = router({
	// Query example: returns a greeting message based on the input text
	hello: procedure
		.input(
			z.object({
				text: z.string()
			})
		)
		.query((opts) => {
			const { text } = opts.input

			return {
				message: `Hello ${text}!`
			}
		}),

	// Mutation example: performs an action with an optional details parameter
	performAction: procedure
		.input(
			z.object({
				actionId: z.number(),
				details: z.string().optional()
			})
		)
		.mutation((opts) => {
			const { actionId, details } = opts.input

			return {
				actionId: actionId,
				details: details,
				message: `Action ${actionId} performed with details: ${details || 'None'}.`
			}
		})
})

export type AppRouter = typeof appRouter
