/**
 * Type tests for typed-endpoint.ts
 *
 * These tests verify that TypeScript correctly infers types from Zod schemas
 * when using the define() function.
 *
 * Run with: npx tsc --noEmit __typetests__/typed-endpoint.test-d.ts
 */
import { define } from '../src/core/typed-endpoint.js'
import { z } from 'zod'

// ============================================================
// Body Type Inference Tests
// ============================================================

// Test: Body type should be inferred from schema
define(
	{
		body: z.object({ name: z.string(), age: z.number() })
	},
	async (request) => {
		const body = await request.json()
		// body should be { name: string; age: number }
		const name: string = body.name
		const age: number = body.age

		// @ts-expect-error - notAProperty doesn't exist
		body.notAProperty

		return { name, age }
	}
)

// Test: Body with optional fields
define(
	{
		body: z.object({
			name: z.string(),
			email: z.string().email().optional()
		})
	},
	async (request) => {
		const body = await request.json()
		const name: string = body.name
		const email: string | undefined = body.email

		return { name, email }
	}
)

// ============================================================
// Query Type Inference Tests
// ============================================================

// Test: Query type should be inferred from schema
define(
	{
		query: z.object({ page: z.number(), limit: z.number().optional() })
	},
	async (request) => {
		// query should be { page: number; limit?: number }
		const page: number = request.query.page
		const limit: number | undefined = request.query.limit

		// @ts-expect-error - notAProperty doesn't exist
		request.query.notAProperty

		return { page, limit }
	}
)

// ============================================================
// Params Type Inference Tests
// ============================================================

// Test: Params type should be inferred from schema
define(
	{
		params: z.object({ id: z.string(), slug: z.string() })
	},
	async (request) => {
		// params should be { id: string; slug: string }
		const id: string = request.params.id
		const slug: string = request.params.slug

		// @ts-expect-error - notAProperty doesn't exist
		request.params.notAProperty

		return { id, slug }
	}
)

// ============================================================
// Headers Type Inference Tests
// ============================================================

// Test: Header accessor should be typed
define(
	{
		headers: z.object({ 'x-api-key': z.string(), 'x-request-id': z.string() })
	},
	async (request) => {
		const apiKey = request.header('x-api-key')
		const requestId = request.header('x-request-id')

		// apiKey and requestId should be string
		const key: string = apiKey
		const reqId: string = requestId

		// Unknown headers should still work (return string | null)
		const unknown = request.header('unknown-header')
		const unknownTyped: string | null = unknown

		return { key, reqId, unknownTyped }
	}
)

// ============================================================
// Empty Schema Tests
// ============================================================

// Test: Empty schema should allow unknown types
define({}, async (request) => {
	const body = await request.json()
	// body should be unknown when no schema provided
	const bodyTyped: unknown = body

	// query should be Record<string, string | string[]>
	const query: Record<string, string | string[]> = request.query

	// params should be Record<string, string>
	const params: Record<string, string> = request.params

	return { bodyTyped, query, params }
})

// ============================================================
// Response Type Tests
// ============================================================

// Test: Response schemas don't affect handler return type inference
define(
	{
		response: {
			200: z.object({ success: z.boolean() }),
			400: z.object({ error: z.string() })
		}
	},
	async () => {
		// Handler can return any shape - response schemas are for documentation only
		return { success: true }
	}
)

// ============================================================
// Combined Schema Tests
// ============================================================

// Test: Full schema with all fields
define(
	{
		summary: 'Create user',
		description: 'Creates a new user',
		tags: ['Users'],
		deprecated: false,
		body: z.object({ name: z.string(), email: z.string().email() }),
		query: z.object({ sendWelcome: z.boolean().optional() }),
		params: z.object({ orgId: z.string().uuid() }),
		headers: z.object({ 'x-api-key': z.string() }),
		response: {
			201: z.object({ id: z.string(), name: z.string() }),
			400: z.object({ error: z.string() })
		}
	},
	async (request) => {
		// All types should be correctly inferred
		const body = await request.json()
		const name: string = body.name
		const email: string = body.email

		const sendWelcome: boolean | undefined = request.query.sendWelcome

		const orgId: string = request.params.orgId

		const apiKey: string = request.header('x-api-key')

		return {
			id: '123',
			name,
			email,
			orgId,
			sendWelcome,
			apiKey
		}
	}
)

// ============================================================
// Handler Function Tests
// ============================================================

// Test: Handler receives reply object
define({}, async (_request, reply) => {
	// reply should have chainable methods
	reply.code(200)
	reply.header('X-Custom', 'value')
	reply.send('OK')

	// hasSent should be a boolean
	const sent: boolean = reply.hasSent

	return { sent }
})

// Test: Handler can be sync or async
define({}, (_request, _reply) => {
	// Sync handler
	return { sync: true }
})

define({}, async (_request, _reply) => {
	// Async handler
	await Promise.resolve()
	return { async: true }
})

// Test: Handler can return void (when using reply.send)
define({}, async (_request, reply) => {
	reply.send('Direct response')
	// No return needed
})

// ============================================================
// SCHEMA_SYMBOL Tests
// ============================================================

import { SCHEMA_SYMBOL } from '../src/core/typed-endpoint.js'

// Test: Defined handler has SCHEMA_SYMBOL property
const handler = define(
	{
		body: z.object({ name: z.string() })
	},
	async () => ({ ok: true })
)

// handler[SCHEMA_SYMBOL] should exist and be the schema
const schema = handler[SCHEMA_SYMBOL]
const _body = schema.body // Should be the Zod schema

console.log('All type tests passed!')
