import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import type { RoboRequest } from '@robojs/server'
import type { Router } from '@trpc/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouterType = Router<any>
let appRouter: RouterType | null = null

export function registerRouter(router: RouterType) {
	appRouter = router
}

export default (req: RoboRequest) => {
	if (!appRouter) {
		throw new Error('Router is not registered. Use `registerRouter` to register your TRPC router.')
	}

	return fetchRequestHandler({
		endpoint: '/api/trpc',
		req: req,
		router: appRouter
	})
}
