import { z } from 'zod'
import { initTRPC } from '@trpc/server'
import { registerRouter } from '@robojs/trpc'

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
registerRouter(appRouter)
