import { HTTP_METHODS } from '../robo/routes/api.js'
import { getPluginRouteRegistry } from './plugin-routes.js'
import type { HandlerSummary } from 'robo.js'
import type { ApiHandlerModule, HttpMethodExport } from '../robo/routes/api.js'
import type { RoboReply, RouteHandler } from './types.js'
import type { RoboRequest } from './robo-request.js'

const PATH_REGEX = new RegExp(/\[(.+?)\]/g)

export interface RegisteredApiRoute {
	routeKey: string
	path: string
	pluginName: string | null
	registrationKind: 'project' | 'plugin-exclusive' | 'plugin-additive'
	summary: HandlerSummary
}

export function normalizeServerPrefix(prefix: string | null | false | undefined): string {
	if (prefix === null || prefix === false) {
		return ''
	}

	let normalized = (prefix ?? '/api').trim()
	if (!normalized) {
		return ''
	}
	if (!normalized.startsWith('/')) {
		normalized = '/' + normalized
	}
	if (normalized.endsWith('/') && normalized.length > 1) {
		normalized = normalized.slice(0, -1)
	}
	return normalized
}

export function getApiRoutePath(prefix: string, routeKey: string): string {
	const routePath = routeKey.replace(PATH_REGEX, ':$1').replace(/^\/+/, '')

	if (!routePath) {
		return prefix || '/'
	}
	if (!prefix || prefix === '/') {
		return '/' + routePath
	}
	return `${prefix}/${routePath}`
}

export function createRegisteredApiRoutes(summary: HandlerSummary, prefix: string): RegisteredApiRoute[] {
	const registry = getPluginRouteRegistry()
	const pluginConfig = summary.plugin ? registry.getPlugin(summary.plugin) : null
	const pluginPrefix = pluginConfig?.apiPrefix ?? ''
	const isExclusive = pluginConfig?.exclusive ?? true
	const basePath = getApiRoutePath(prefix, summary.key)

	if (isExclusive && pluginPrefix) {
		return [
			{
				routeKey: summary.key,
				path: getPrefixedPath(pluginPrefix, basePath),
				pluginName: summary.plugin,
				registrationKind: 'plugin-exclusive',
				summary
			}
		]
	}

	if (!isExclusive && pluginPrefix) {
		return [
			{
				routeKey: summary.key,
				path: basePath,
				pluginName: summary.plugin,
				registrationKind: 'project',
				summary
			},
			{
				routeKey: summary.key,
				path: getPrefixedPath(pluginPrefix, basePath),
				pluginName: summary.plugin,
				registrationKind: 'plugin-additive',
				summary
			}
		]
	}

	return [
		{
			routeKey: summary.key,
			path: basePath,
			pluginName: summary.plugin,
			registrationKind: 'project',
			summary
		}
	]
}

export function createMethodDispatcher(handler: ApiHandlerModule | null): RouteHandler | null {
	if (!handler) return null

	const hasDefault = typeof handler.default === 'function'
	const methodExports = HTTP_METHODS.filter((method) => typeof handler[method] === 'function')

	if (hasDefault && methodExports.length === 0) {
		return handler.default as RouteHandler
	}

	const getAllowedMethods = () => {
		const allowed = [...methodExports]
		if (hasDefault) {
			for (const method of HTTP_METHODS) {
				if (!allowed.includes(method)) {
					allowed.push(method)
				}
			}
		}
		return allowed
	}

	return async (req: RoboRequest, reply: RoboReply): Promise<unknown> => {
		const method = req.method.toUpperCase() as HttpMethodExport

		if (method === 'OPTIONS' && !handler.OPTIONS && !hasDefault) {
			const allowed = getAllowedMethods()
			reply.header('Allow', allowed.join(', '))
			return reply.code(204).send('')
		}

		const methodHandler = handler[method] as RouteHandler | undefined
		if (methodHandler) {
			return methodHandler(req, reply)
		}

		if (method === 'HEAD' && handler.GET) {
			return (handler.GET as RouteHandler)(req, reply)
		}

		if (hasDefault) {
			return (handler.default as RouteHandler)(req, reply)
		}

		reply.header('Allow', methodExports.join(', '))
		return reply.code(405).json({
			error: 'Method Not Allowed',
			message: `${method} is not supported for this endpoint`,
			allowedMethods: methodExports
		})
	}
}

function getPrefixedPath(pluginPrefix: string, basePath: string): string {
	if (basePath === '/') {
		return pluginPrefix
	}
	return `${pluginPrefix}${basePath}`
}
