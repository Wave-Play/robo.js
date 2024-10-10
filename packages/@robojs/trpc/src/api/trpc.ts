import { appRouter } from './trpc/[trpc].js'
import { serverPrefix } from '../events/_start.js'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import type { RoboRequest } from '@robojs/server'

export default (req: RoboRequest) => {
	if (!appRouter) {
		throw new Error('Router is not registered. Use `initTRPC` from `@robojs/trpc` instead of `@trpc/server` to create the router.')
	}

	return fetchRequestHandler({
		endpoint: serverPrefix + '/trpc',
		req: req,
		router: appRouter
	})
}
