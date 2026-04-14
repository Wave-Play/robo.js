import { controller } from '../robo/routes/api.js'
import type { HandlerModule } from 'robo.js'
import { createTestRequest } from './create-test-request.js'
import type { TestRouteOptions, TestRouteResult, TestableModule, TestRequestOptions } from './types.js'

// Local HandlerRecord type to match what controller() expects
type HandlerRecord = {
	handler: (HandlerModule & Record<string, unknown>) | null
	key: string
	type: string
	path: string
	exports: { default: boolean; config: boolean; named: string[] }
	metadata: Record<string, unknown>
	enabled: boolean
}

/**
 * Creates a mock handler record for the controller
 */
function createMockRecord(module: TestableModule): HandlerRecord {
	const handlerModule: HandlerModule & Record<string, unknown> = {
		default: module.default,
		config: module.config,
		...module
	}

	return {
		handler: handlerModule,
		key: 'test',
		type: 'server:api',
		path: 'test.js',
		exports: {
			default: !!module.default,
			config: !!module.config,
			named: Object.keys(module).filter((k) => !['default', 'config'].includes(k))
		},
		metadata: {},
		enabled: true
	}
}

/**
 * Wraps a Response with convenience methods for easier assertions
 */
function wrapResponse(response: Response): TestRouteResult {
	return {
		response,
		status: response.status,
		ok: response.ok,
		header: (name: string) => response.headers.get(name),
		json: async <T = unknown>() => {
			const cloned = response.clone()
			return cloned.json() as Promise<T>
		},
		text: async () => {
			const cloned = response.clone()
			return cloned.text()
		}
	}
}

/**
 * Tests an API route module by dispatching to the appropriate handler.
 * Handles method routing, OPTIONS auto-handling, HEAD fallback, and response conversion.
 *
 * @example
 * ```typescript
 * import { testRoute } from '@robojs/server/testing'
 * import * as usersRoute from '../src/api/users/[id]'
 *
 * // Test GET request
 * const result = await testRoute(usersRoute, {
 *   method: 'GET',
 *   params: { id: '123' }
 * })
 * expect(result.status).toBe(200)
 * expect(await result.json()).toEqual({ id: '123' })
 *
 * // Test POST request with body
 * const postResult = await testRoute(usersRoute, {
 *   method: 'POST',
 *   body: { name: 'John' }
 * })
 * expect(postResult.status).toBe(201)
 * ```
 */
export async function testRoute(module: TestableModule, options: TestRouteOptions = {}): Promise<TestRouteResult> {
	const request = createTestRequest(options)
	const record = createMockRecord(module)
	const ctrl = controller('test', record, null)

	const response = await ctrl.execute(request)

	return wrapResponse(response)
}

/**
 * Tests a specific handler function directly without method dispatch.
 * Use this when you want to test a single handler in isolation.
 *
 * @example
 * ```typescript
 * import { testHandler } from '@robojs/server/testing'
 * import { GET } from '../src/api/users/[id]'
 *
 * const result = await testHandler(GET, {
 *   params: { id: '123' }
 * })
 *
 * // Result is the raw return value from the handler
 * expect(result).toEqual({ id: '123', name: 'John' })
 * ```
 */
export async function testHandler<T>(
	handler: (request: Request) => T | Promise<T>,
	options: TestRequestOptions = {}
): Promise<T> {
	const request = createTestRequest(options)
	return handler(request)
}
