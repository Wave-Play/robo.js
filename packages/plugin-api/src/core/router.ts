import { createRouter } from './radix3.js'
import type { RouteHandler } from './types.js'

interface Route {
	handler: RouteHandler
	path: string
}

interface RouteResult {
	handler: RouteHandler
	params: Record<string, string>
	path: string
	query: Record<string, string | string[]>
}

export class Router {
	private readonly _router = createRouter()
	private readonly _routes: Route[] = []

	addRoute(route: Route) {
		this._router.insert(route.path, route)
		this._routes.push(route)
	}

	find(path: string): RouteResult {
		// Remove query params from the path to avoid param issues.
		const hasQuery = path.includes('?')
		const route = this._router.lookup(hasQuery ? path.substring(0, path.indexOf('?')) : path)

		if (!route) {
			return null
		}

		return {
			handler: route.handler as RouteHandler,
			params: route.params as Record<string, string>,
			path: route.path as string,
			query: hasQuery ? parseQuery(path) : {}
		}
	}

	removeRoute(path: string) {
		this._router.remove(path)
		const routeIndex = this._routes.findIndex((route) => route.path === path)
		this._routes.splice(routeIndex, 1)
	}

	stats() {
		return {
			key: 'radix-router',
			numRoutes: this._routes.length,
			routes: this._routes
		}
	}
}

const parseQuery = (path: string): Record<string, string | string[]> => {
	const query: Record<string, string | string[]> = {}

	// Parse out queries!
	const queries = path.substring(path.indexOf('?') + 1).split('&')
	for (const queryPair of queries) {
		const queryPairSplit = queryPair.indexOf('=')
		const key = queryPair.substring(0, queryPairSplit)
		const value = queryPair.substring(queryPairSplit + 1)
		const result = value?.split(',') ?? []
		const isArray = Array.isArray(result)

		if (isArray) {
			for (let i = 0; i < result.length; i++) {
				result[i] = decodeURIComponent(result[i])
			}
		}

		// Don't store as array if there's only one value
		if (isArray && result.length === 1) {
			query[key] = result[0]
		} else {
			query[key] = result
		}
	}

	return query
}
