import { initTRPC } from '@trpc/server'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { createTRPCClient as _createTRPCClient, createTRPCReact as _createTRPCReact } from '@trpc/react-query'
import { serverPrefix } from '../../events/_start.js'
import { trpcLogger } from '../../core/loggers.js'
import type { RoboRequest } from '@robojs/server'
import type { CreateTRPCClientOptions, CreateTRPCReact } from '@trpc/react-query'
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import'
import type { CreateTRPCReactOptions } from '@trpc/react-query/dist/shared'

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

const createRouter = () => init.create().router({})
export type Router = ReturnType<typeof createRouter>

export function createTRPCReact<TRouter extends AnyRouter, TSSRContext = unknown>(
	options?: CreateTRPCReactOptions<TRouter>
): CreateTRPCReact<TRouter, TSSRContext> {
	return _createTRPCReact<TRouter, TSSRContext>(options)
}

export function createTRPCClient<AppRouter extends Router>(opts: CreateTRPCClientOptions<AppRouter>) {
	return _createTRPCClient<AppRouter>(opts)
}

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
