import { initTRPC } from '@robojs/trpc'
import { z } from 'zod'

const t = initTRPC.create()
export const router = t.router
export const procedure = t.procedure

export const appRouter = router({
	hello: procedure
		.input(
			z.object({
				text: z.string()
			})
		)
		.query((opts) => {
			return {
				greeting: `Hello ${opts.input.text}!`
			}
		})
})

export type AppRouter = typeof appRouter
