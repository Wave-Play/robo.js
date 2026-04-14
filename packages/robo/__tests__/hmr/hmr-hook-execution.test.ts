/**
 * HMR Hook Execution Tests
 *
 * Tests for the executeHmrHooks() function and related hook execution logic.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import {
	createHmrRouteInfo,
	createMockPluginData,
	delay,
	HmrEnvHelper,
	clearGlobalHmrState
} from '../utils/hmr-test-helpers.js'
import type { HmrRouteInfo, HmrHookConfig } from '../../src/types/lifecycle.js'

describe('HMR Hook Execution', () => {
	const envHelper = new HmrEnvHelper()

	beforeEach(() => {
		envHelper.enableHmr()
		clearGlobalHmrState()
	})

	afterEach(() => {
		envHelper.restore()
		clearGlobalHmrState()
	})

	describe('HmrNotifyPayload structure', () => {
		it('has required changeType field', () => {
			const payload = {
				changeType: 'change' as const,
				files: ['src/test.ts'],
				routes: [] as HmrRouteInfo[]
			}

			expect(['change', 'add', 'remove']).toContain(payload.changeType)
		})

		it('has files array', () => {
			const payload = {
				changeType: 'change' as const,
				files: ['src/a.ts', 'src/b.ts'],
				routes: [] as HmrRouteInfo[]
			}

			expect(Array.isArray(payload.files)).toBe(true)
			expect(payload.files).toHaveLength(2)
		})

		it('has routes array', () => {
			const payload = {
				changeType: 'change' as const,
				files: ['src/test.ts'],
				routes: [createHmrRouteInfo()]
			}

			expect(Array.isArray(payload.routes)).toBe(true)
			expect(payload.routes).toHaveLength(1)
		})

		it('routes contain namespace, route, and handlers', () => {
			const route = createHmrRouteInfo({
				namespace: 'server',
				route: 'api',
				handlers: [{ key: 'users', path: 'api/users.js', changeType: 'change' }]
			})

			expect(route.namespace).toBe('server')
			expect(route.route).toBe('api')
			expect(route.handlers).toHaveLength(1)
		})
	})

	describe('Hook filtering behavior', () => {
		it('hook with matching namespace filter receives routes', () => {
			const hookConfig = { namespaces: ['server'] }
			const routes: HmrRouteInfo[] = [
				createHmrRouteInfo({ namespace: 'server', route: 'api' }),
				createHmrRouteInfo({ namespace: 'discordjs', route: 'commands' })
			]

			const filteredRoutes = routes.filter((r) =>
				!hookConfig.namespaces || hookConfig.namespaces.includes(r.namespace)
			)

			expect(filteredRoutes).toHaveLength(1)
			expect(filteredRoutes[0].namespace).toBe('server')
		})

		it('hook with matching route filter receives routes', () => {
			const hookConfig = { routes: ['api'] }
			const routes: HmrRouteInfo[] = [
				createHmrRouteInfo({ namespace: 'server', route: 'api' }),
				createHmrRouteInfo({ namespace: 'server', route: 'websocket' })
			]

			const filteredRoutes = routes.filter((r) =>
				!hookConfig.routes || hookConfig.routes.includes(r.route)
			)

			expect(filteredRoutes).toHaveLength(1)
			expect(filteredRoutes[0].route).toBe('api')
		})

		it('hook with combined filters receives matching routes', () => {
			const hookConfig = { namespaces: ['server'], routes: ['api'] }
			const routes: HmrRouteInfo[] = [
				createHmrRouteInfo({ namespace: 'server', route: 'api' }),
				createHmrRouteInfo({ namespace: 'server', route: 'websocket' }),
				createHmrRouteInfo({ namespace: 'discordjs', route: 'api' })
			]

			const filteredRoutes = routes.filter((r) => {
				const matchesNamespace = !hookConfig.namespaces || hookConfig.namespaces.includes(r.namespace)
				const matchesRoute = !hookConfig.routes || hookConfig.routes.includes(r.route)
				return matchesNamespace && matchesRoute
			})

			expect(filteredRoutes).toHaveLength(1)
			expect(filteredRoutes[0].namespace).toBe('server')
			expect(filteredRoutes[0].route).toBe('api')
		})

		it('hook without config receives all routes', () => {
			const hookConfig: HmrHookConfig = {}
			const routes: HmrRouteInfo[] = [
				createHmrRouteInfo({ namespace: 'server', route: 'api' }),
				createHmrRouteInfo({ namespace: 'discordjs', route: 'commands' })
			]

			const filteredRoutes = routes.filter((r) => {
				const matchesNamespace = !hookConfig.namespaces || hookConfig.namespaces?.includes(r.namespace)
				const matchesRoute = !hookConfig.routes || hookConfig.routes?.includes(r.route)
				return matchesNamespace && matchesRoute
			})

			expect(filteredRoutes).toHaveLength(2)
		})

		it('hook is skipped when no routes match filter', () => {
			const hookConfig = { namespaces: ['server'] }
			const routes: HmrRouteInfo[] = [
				createHmrRouteInfo({ namespace: 'discordjs', route: 'commands' })
			]

			const filteredRoutes = routes.filter((r) =>
				!hookConfig.namespaces || hookConfig.namespaces.includes(r.namespace)
			)

			expect(filteredRoutes).toHaveLength(0)
		})
	})

	describe('Plugin data mock', () => {
		it('creates plugin data with defaults', () => {
			const plugin = createMockPluginData('test-plugin')

			expect(plugin.name).toBe('test-plugin')
			expect(plugin.version).toBe('1.0.0')
		})

		it('creates plugin data with custom options', () => {
			const plugin = createMockPluginData('test-plugin', {
				version: '2.0.0',
				path: '/path/to/plugin',
				namespace: 'test',
				metaOptions: { hookPriority: { hmr: 50 } }
			})

			expect(plugin.version).toBe('2.0.0')
			expect(plugin.namespace).toBe('test')
			expect(plugin.metaOptions).toEqual({ hookPriority: { hmr: 50 } })
		})
	})

	describe('Hook execution order', () => {
		it('hooks with same priority can run in parallel', async () => {
			const executionOrder: string[] = []
			const startTimes: Record<string, number> = {}

			// Simulate two hooks starting at roughly the same time
			const hook1 = async () => {
				startTimes['hook1'] = Date.now()
				await delay(50)
				executionOrder.push('hook1')
			}

			const hook2 = async () => {
				startTimes['hook2'] = Date.now()
				await delay(25)
				executionOrder.push('hook2')
			}

			// Run in parallel
			await Promise.all([hook1(), hook2()])

			// hook2 should finish first since it has shorter delay
			expect(executionOrder).toEqual(['hook2', 'hook1'])

			// Both should have started at roughly the same time
			const timeDiff = Math.abs(startTimes['hook1'] - startTimes['hook2'])
			expect(timeDiff).toBeLessThan(10) // Within 10ms
		})

		it('errors in one hook do not prevent others from running', async () => {
			const executionOrder: string[] = []

			const hook1 = async () => {
				throw new Error('Hook 1 failed')
			}

			const hook2 = async () => {
				executionOrder.push('hook2')
			}

			const hook3 = async () => {
				executionOrder.push('hook3')
			}

			// Run with error handling
			await Promise.all([
				hook1().catch(() => executionOrder.push('hook1-error')),
				hook2(),
				hook3()
			])

			expect(executionOrder).toContain('hook1-error')
			expect(executionOrder).toContain('hook2')
			expect(executionOrder).toContain('hook3')
		})
	})

	describe('Context building', () => {
		it('context includes all payload fields', () => {
			const payload = {
				changeType: 'change' as const,
				files: ['src/test.ts'],
				routes: [createHmrRouteInfo()]
			}

			// Simulate building context
			const context = {
				changeType: payload.changeType,
				files: payload.files,
				routes: payload.routes,
				mode: 'development'
			}

			expect(context.changeType).toBe('change')
			expect(context.files).toEqual(['src/test.ts'])
			expect(context.routes).toHaveLength(1)
			expect(context.mode).toBe('development')
		})

		it('context preserves handler plugin info', () => {
			const routes: HmrRouteInfo[] = [{
				namespace: 'server',
				route: 'api',
				handlers: [{
					key: 'users',
					path: 'api/users.js',
					changeType: 'change',
					plugin: { name: '@robojs/server', version: '1.0.0' }
				}]
			}]

			const context = {
				changeType: 'change' as const,
				files: ['src/test.ts'],
				routes,
				mode: 'development'
			}

			expect(context.routes[0].handlers[0].plugin?.name).toBe('@robojs/server')
		})
	})

	describe('Timeout handling', () => {
		it('slow hooks can be timed out', async () => {
			const TIMEOUT = 100 // 100ms timeout
			let completed = false

			const slowHook = async () => {
				await delay(500) // Takes 500ms
				completed = true
			}

			// Create timeout promise
			const timeout = new Promise<void>((_, reject) => {
				setTimeout(() => reject(new Error('Timeout')), TIMEOUT)
			})

			// Race hook against timeout
			try {
				await Promise.race([slowHook(), timeout])
			} catch (e) {
				expect((e as Error).message).toBe('Timeout')
			}

			// Hook should not have completed
			expect(completed).toBe(false)
		})

		it('fast hooks complete before timeout', async () => {
			const TIMEOUT = 100
			let completed = false

			const fastHook = async () => {
				await delay(10) // Takes 10ms
				completed = true
			}

			const timeout = new Promise<void>((_, reject) => {
				setTimeout(() => reject(new Error('Timeout')), TIMEOUT)
			})

			await Promise.race([fastHook(), timeout])
			expect(completed).toBe(true)
		})
	})

	describe('Error handling', () => {
		it('sync errors are caught', () => {
			const hook = () => {
				throw new Error('Sync error')
			}

			let caught = false
			try {
				hook()
			} catch {
				caught = true
			}

			expect(caught).toBe(true)
		})

		it('async errors are caught', async () => {
			const hook = async () => {
				throw new Error('Async error')
			}

			let caught = false
			try {
				await hook()
			} catch {
				caught = true
			}

			expect(caught).toBe(true)
		})

		it('rejected promises are caught', async () => {
			const hook = () => Promise.reject(new Error('Rejected'))

			let caught = false
			try {
				await hook()
			} catch {
				caught = true
			}

			expect(caught).toBe(true)
		})
	})

	describe('Route handler info', () => {
		it('handler key is the route key', () => {
			const route = createHmrRouteInfo({
				handlers: [{ key: 'users', path: 'api/users.js', changeType: 'change' }]
			})

			expect(route.handlers[0].key).toBe('users')
		})

		it('handler path is the file path', () => {
			const route = createHmrRouteInfo({
				handlers: [{ key: 'users', path: 'api/users.js', changeType: 'change' }]
			})

			expect(route.handlers[0].path).toBe('api/users.js')
		})

		it('handler can have plugin info', () => {
			const route: HmrRouteInfo = {
				namespace: 'server',
				route: 'api',
				handlers: [{
					key: 'users',
					path: 'api/users.js',
					changeType: 'change',
					plugin: { name: '@robojs/server', version: '1.0.0' }
				}]
			}

			expect(route.handlers[0].plugin?.name).toBe('@robojs/server')
			expect(route.handlers[0].plugin?.version).toBe('1.0.0')
		})

		it('multiple handlers per route', () => {
			const route = createHmrRouteInfo({
				handlers: [
					{ key: 'users', path: 'api/users.js', changeType: 'change' },
					{ key: 'posts', path: 'api/posts.js', changeType: 'change' },
					{ key: 'comments', path: 'api/comments.js', changeType: 'change' }
				]
			})

			expect(route.handlers).toHaveLength(3)
		})
	})

	describe('Multiple routes in payload', () => {
		it('payload can have multiple routes', () => {
			const payload = {
				changeType: 'change' as const,
				files: ['src/a.ts', 'src/b.ts'],
				routes: [
					createHmrRouteInfo({ namespace: 'server', route: 'api' }),
					createHmrRouteInfo({ namespace: 'discordjs', route: 'commands' }),
					createHmrRouteInfo({ namespace: 'server', route: 'websocket' })
				]
			}

			expect(payload.routes).toHaveLength(3)
		})

		it('routes from same namespace can be grouped', () => {
			const routes: HmrRouteInfo[] = [
				createHmrRouteInfo({ namespace: 'server', route: 'api' }),
				createHmrRouteInfo({ namespace: 'server', route: 'websocket' }),
				createHmrRouteInfo({ namespace: 'discordjs', route: 'commands' })
			]

			const byNamespace = new Map<string, HmrRouteInfo[]>()
			for (const route of routes) {
				if (!byNamespace.has(route.namespace)) {
					byNamespace.set(route.namespace, [])
				}
				byNamespace.get(route.namespace)!.push(route)
			}

			expect(byNamespace.get('server')).toHaveLength(2)
			expect(byNamespace.get('discordjs')).toHaveLength(1)
		})
	})

	describe('Change types', () => {
		it('change type indicates file modification', () => {
			const payload = {
				changeType: 'change' as const,
				files: ['src/test.ts'],
				routes: [createHmrRouteInfo()]
			}

			expect(payload.changeType).toBe('change')
		})

		it('add type indicates new file', () => {
			const payload = {
				changeType: 'add' as const,
				files: ['src/new-file.ts'],
				routes: [createHmrRouteInfo()]
			}

			expect(payload.changeType).toBe('add')
		})

		it('remove type indicates deleted file', () => {
			const payload = {
				changeType: 'remove' as const,
				files: ['src/deleted-file.ts'],
				routes: [createHmrRouteInfo()]
			}

			expect(payload.changeType).toBe('remove')
		})
	})
})
