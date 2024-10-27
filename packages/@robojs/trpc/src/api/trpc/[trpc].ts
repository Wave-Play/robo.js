import { initTRPC } from '@trpc/server'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { serverPrefix } from '../../events/_start.js'
import { trpcLogger } from '../../core/loggers.js'
import type { RoboRequest } from '@robojs/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let appRouter: any | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => any

function createWrapper<F extends AnyFunction>(fn: F): F {
	const wrapper = (...args: Parameters<F>): ReturnType<F> => {
		const result = fn(...args)
		appRouter = result
		return result
	}

	return wrapper as F
}

export const init = {
	create(): ReturnType<typeof initTRPC.create> {
		const t = initTRPC.create()
		const originalRouter = t.router
		t.router = createWrapper(originalRouter) as typeof t.router
		trpcLogger.ready('tRPC router registered successfully')

		return t
	}
}

export const createRouter = () => init.create().router({})

export default (req: RoboRequest) => {
	if (!appRouter) {
		throw new Error(
			'Router is not registered. Use `initTRPC` from `@robojs/trpc` instead of `@trpc/server` to create the router.'
		)
	}

	return fetchRequestHandler({
		endpoint: serverPrefix + '/trpc',
		req: req,
		router: appRouter
	})
}
