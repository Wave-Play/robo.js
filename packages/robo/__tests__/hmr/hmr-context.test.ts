/**
 * HMR Context Tests
 *
 * Tests for building and filtering HmrContext objects.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
	createContext,
	createFullContext,
	createHmrRouteInfo,
	createHookConfig,
	HmrEnvHelper,
	clearGlobalHmrState
} from '../utils/hmr-test-helpers.js'
import type { HmrEventRouteInfo } from '../../src/core/hmr.js'
import type { HmrHookConfig } from '../../src/types/lifecycle.js'

describe('HmrContext', () => {
	const envHelper = new HmrEnvHelper()

	beforeEach(() => {
		envHelper.enableHmr()
		clearGlobalHmrState()
	})

	afterEach(() => {
		envHelper.restore()
		clearGlobalHmrState()
	})

	describe('createContext() helper', () => {
		it('creates context with default values', () => {
			const context = createContext()

			expect(context.changeType).toBe('change')
			expect(context.files).toEqual(['src/test-file.ts'])
			expect(context.mode).toBe('development')
			expect(context.routes).toHaveLength(1)
			expect(context.routes[0].namespace).toBe('server')
			expect(context.routes[0].route).toBe('api')
		})

		it('allows overriding changeType', () => {
			const context = createContext({ changeType: 'add' })
			expect(context.changeType).toBe('add')
		})

		it('allows overriding files', () => {
			const context = createContext({ files: ['src/a.ts', 'src/b.ts'] })
			expect(context.files).toEqual(['src/a.ts', 'src/b.ts'])
		})

		it('allows overriding namespace and route', () => {
			const context = createContext({ namespace: 'discordjs', route: 'commands' })
			expect(context.routes[0].namespace).toBe('discordjs')
			expect(context.routes[0].route).toBe('commands')
		})

		it('allows providing custom handlers', () => {
			const handlers = [
				{ key: 'users', path: 'api/users.js', changeType: 'change' as const },
				{ key: 'posts', path: 'api/posts.js', changeType: 'change' as const }
			]
			const context = createContext({ handlers })
			expect(context.routes[0].handlers).toEqual(handlers)
		})

		it('allows providing full routes array', () => {
			const routes: HmrEventRouteInfo[] = [
				{ namespace: 'server', route: 'api', handlers: [] },
				{ namespace: 'discordjs', route: 'commands', handlers: [] }
			]
			const context = createContext({ routes })
			expect(context.routes).toEqual(routes)
		})
	})

	describe('createFullContext() helper', () => {
		it('creates context with multiple default routes', () => {
			const context = createFullContext()

			expect(context.routes).toHaveLength(2)
			expect(context.routes[0].namespace).toBe('server')
			expect(context.routes[1].namespace).toBe('discordjs')
		})

		it('allows providing custom routes', () => {
			const routes: HmrEventRouteInfo[] = [
				{ namespace: 'custom', route: 'events', handlers: [] }
			]
			const context = createFullContext(routes)

			expect(context.routes).toHaveLength(1)
			expect(context.routes[0].namespace).toBe('custom')
		})
	})

	describe('createHmrRouteInfo() helper', () => {
		it('creates route info with defaults', () => {
			const routeInfo = createHmrRouteInfo()

			expect(routeInfo.namespace).toBe('server')
			expect(routeInfo.route).toBe('api')
			expect(routeInfo.handlers).toHaveLength(1)
		})

		it('allows overriding namespace', () => {
			const routeInfo = createHmrRouteInfo({ namespace: 'discordjs' })
			expect(routeInfo.namespace).toBe('discordjs')
		})

		it('allows overriding route', () => {
			const routeInfo = createHmrRouteInfo({ route: 'commands' })
			expect(routeInfo.route).toBe('commands')
		})

		it('allows providing handlers', () => {
			const handlers = [{ key: 'ping', path: 'commands/ping.js', changeType: 'change' as const }]
			const routeInfo = createHmrRouteInfo({ handlers })
			expect(routeInfo.handlers).toEqual(handlers)
		})
	})

	describe('HmrEventContext structure', () => {
		it('has required changeType field', () => {
			const context = createContext({ changeType: 'change' })
			expect(['change', 'add', 'remove']).toContain(context.changeType)
		})

		it('changeType can be add', () => {
			const context = createContext({ changeType: 'add' })
			expect(context.changeType).toBe('add')
		})

		it('changeType can be remove', () => {
			const context = createContext({ changeType: 'remove' })
			expect(context.changeType).toBe('remove')
		})

		it('has files array', () => {
			const context = createContext({ files: ['a.ts', 'b.ts'] })
			expect(Array.isArray(context.files)).toBe(true)
			expect(context.files).toEqual(['a.ts', 'b.ts'])
		})

		it('has routes array with handler info', () => {
			const context = createContext({
				namespace: 'server',
				route: 'api',
				handlers: [
					{ key: 'users', path: 'api/users.js', changeType: 'change' as const },
					{
						key: 'posts',
						path: 'api/posts.js',
						changeType: 'change' as const,
						plugin: { name: '@robojs/server', version: '1.0.0' }
					}
				]
			})

			expect(context.routes).toHaveLength(1)
			expect(context.routes[0].handlers).toHaveLength(2)
			expect(context.routes[0].handlers[0].key).toBe('users')
			expect(context.routes[0].handlers[1].plugin?.name).toBe('@robojs/server')
		})

		it('has mode field', () => {
			const context = createContext({ mode: 'production' })
			expect(context.mode).toBe('production')
		})
	})

	describe('HmrHookConfig structure', () => {
		it('creates config with defaults', () => {
			const config = createHookConfig()
			expect(config.namespaces).toBeUndefined()
			expect(config.routes).toBeUndefined()
		})

		it('allows setting namespaces filter', () => {
			const config = createHookConfig({ namespaces: ['server'] })
			expect(config.namespaces).toEqual(['server'])
		})

		it('allows setting routes filter', () => {
			const config = createHookConfig({ routes: ['api', 'websocket'] })
			expect(config.routes).toEqual(['api', 'websocket'])
		})

		it('allows setting both filters', () => {
			const config = createHookConfig({
				namespaces: ['server', 'discordjs'],
				routes: ['api', 'commands']
			})
			expect(config.namespaces).toEqual(['server', 'discordjs'])
			expect(config.routes).toEqual(['api', 'commands'])
		})
	})

	describe('Context filtering logic', () => {
		it('routes with matching namespace pass filter', () => {
			const context = createContext({ namespace: 'server', route: 'api' })
			const config: HmrHookConfig = { namespaces: ['server'] }

			const matchingRoutes = context.routes.filter((r) =>
				!config.namespaces || config.namespaces.includes(r.namespace)
			)

			expect(matchingRoutes).toHaveLength(1)
		})

		it('routes with non-matching namespace fail filter', () => {
			const context = createContext({ namespace: 'discordjs', route: 'commands' })
			const config: HmrHookConfig = { namespaces: ['server'] }

			const matchingRoutes = context.routes.filter((r) =>
				!config.namespaces || config.namespaces.includes(r.namespace)
			)

			expect(matchingRoutes).toHaveLength(0)
		})

		it('routes with matching route pass filter', () => {
			const context = createContext({ namespace: 'server', route: 'api' })
			const config: HmrHookConfig = { routes: ['api'] }

			const matchingRoutes = context.routes.filter((r) =>
				!config.routes || config.routes.includes(r.route)
			)

			expect(matchingRoutes).toHaveLength(1)
		})

		it('routes with non-matching route fail filter', () => {
			const context = createContext({ namespace: 'server', route: 'websocket' })
			const config: HmrHookConfig = { routes: ['api'] }

			const matchingRoutes = context.routes.filter((r) =>
				!config.routes || config.routes.includes(r.route)
			)

			expect(matchingRoutes).toHaveLength(0)
		})

		it('combined filters require both to match', () => {
			const context = createFullContext([
				{ namespace: 'server', route: 'api', handlers: [] },
				{ namespace: 'server', route: 'websocket', handlers: [] },
				{ namespace: 'discordjs', route: 'api', handlers: [] }
			])

			const config: HmrHookConfig = { namespaces: ['server'], routes: ['api'] }

			const matchingRoutes = context.routes.filter((r) => {
				const matchesNamespace = !config.namespaces || config.namespaces.includes(r.namespace)
				const matchesRoute = !config.routes || config.routes.includes(r.route)
				return matchesNamespace && matchesRoute
			})

			expect(matchingRoutes).toHaveLength(1)
			expect(matchingRoutes[0].namespace).toBe('server')
			expect(matchingRoutes[0].route).toBe('api')
		})

		it('undefined config passes all routes', () => {
			const context = createFullContext()
			const config: HmrHookConfig = {}

			const matchingRoutes = context.routes.filter((r) => {
				const matchesNamespace = !config.namespaces || config.namespaces.includes(r.namespace)
				const matchesRoute = !config.routes || config.routes.includes(r.route)
				return matchesNamespace && matchesRoute
			})

			expect(matchingRoutes).toHaveLength(2)
		})
	})

	describe('Handler info in routes', () => {
		it('includes key and path in handler info', () => {
			const context = createContext({
				handlers: [{ key: 'users', path: 'api/users.js' }]
			})

			const handler = context.routes[0].handlers[0]
			expect(handler.key).toBe('users')
			expect(handler.path).toBe('api/users.js')
		})

		it('includes optional plugin info', () => {
			const context = createContext({
				handlers: [
					{
						key: 'users',
						path: 'api/users.js',
						plugin: { name: '@robojs/server', version: '1.0.0' }
					}
				]
			})

			const handler = context.routes[0].handlers[0]
			expect(handler.plugin?.name).toBe('@robojs/server')
			expect(handler.plugin?.version).toBe('1.0.0')
		})

		it('handler without plugin has undefined plugin', () => {
			const context = createContext({
				handlers: [{ key: 'users', path: 'api/users.js' }]
			})

			const handler = context.routes[0].handlers[0]
			expect(handler.plugin).toBeUndefined()
		})
	})

	describe('Multiple routes in context', () => {
		it('can have routes from different namespaces', () => {
			const context = createFullContext([
				{ namespace: 'server', route: 'api', handlers: [] },
				{ namespace: 'discordjs', route: 'commands', handlers: [] },
				{ namespace: 'custom', route: 'events', handlers: [] }
			])

			expect(context.routes).toHaveLength(3)
			const namespaces = context.routes.map((r) => r.namespace)
			expect(namespaces).toContain('server')
			expect(namespaces).toContain('discordjs')
			expect(namespaces).toContain('custom')
		})

		it('can have routes from same namespace different routes', () => {
			const context = createFullContext([
				{ namespace: 'server', route: 'api', handlers: [] },
				{ namespace: 'server', route: 'websocket', handlers: [] },
				{ namespace: 'server', route: 'static', handlers: [] }
			])

			expect(context.routes).toHaveLength(3)
			const routes = context.routes.map((r) => r.route)
			expect(routes).toContain('api')
			expect(routes).toContain('websocket')
			expect(routes).toContain('static')
		})

		it('each route can have multiple handlers', () => {
			const context = createFullContext([
				{
					namespace: 'server',
					route: 'api',
					handlers: [
						{ key: 'users', path: 'api/users.js', changeType: 'change' as const },
						{ key: 'posts', path: 'api/posts.js', changeType: 'change' as const },
						{ key: 'comments', path: 'api/comments.js', changeType: 'change' as const }
					]
				}
			])

			expect(context.routes[0].handlers).toHaveLength(3)
		})
	})

	describe('Edge cases', () => {
		it('handles empty files array', () => {
			const context = createContext({ files: [] })
			expect(context.files).toEqual([])
		})

		it('handles empty routes array', () => {
			const context = createContext({ routes: [] })
			expect(context.routes).toEqual([])
		})

		it('handles empty handlers array', () => {
			const context = createContext({
				routes: [{ namespace: 'server', route: 'api', handlers: [] }]
			})
			expect(context.routes[0].handlers).toEqual([])
		})

		it('handles routes with empty namespace filter array', () => {
			const config: HmrHookConfig = { namespaces: [] }
			const context = createContext()

			// Empty array means filter out everything
			const matchingRoutes = context.routes.filter((r) =>
				!config.namespaces || config.namespaces.includes(r.namespace)
			)

			expect(matchingRoutes).toHaveLength(0)
		})

		it('handles routes with empty route filter array', () => {
			const config: HmrHookConfig = { routes: [] }
			const context = createContext()

			// Empty array means filter out everything
			const matchingRoutes = context.routes.filter((r) =>
				!config.routes || config.routes.includes(r.route)
			)

			expect(matchingRoutes).toHaveLength(0)
		})
	})
})
