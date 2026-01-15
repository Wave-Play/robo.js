import { describe, expect, it, jest } from '@jest/globals'
import type { RoboReply } from '../src/core/types.js'
import { RoboRequest } from '../src/core/robo-request.js'
import { define, SCHEMA_SYMBOL } from '../src/core/typed-endpoint.js'
import { extractSchema, hasSchema } from '../src/core/schema-extractor.js'
import { z } from 'zod'

function createMockReply(): RoboReply {
	const reply = {
		raw: {} as RoboReply['raw'],
		hasSent: false,
		code: jest.fn(),
		header: jest.fn(),
		json: jest.fn(),
		send: jest.fn()
	} as any

	reply.code = jest.fn(() => reply)
	reply.header = jest.fn(() => reply)
	reply.json = jest.fn(() => reply)
	reply.send = jest.fn(() => reply)

	return reply as RoboReply
}

describe('Integration: Full typed endpoint flow', () => {
	it('complete flow from define() to schema extraction', async () => {
		// Step 1: Define a comprehensive typed endpoint
		const UserSchema = z.object({
			name: z.string(),
			email: z.string().email()
		})

		const handler = define(
			{
				summary: 'Create user',
				description: 'Creates a new user in the organization',
				tags: ['Users', 'Admin'],
				params: z.object({ orgId: z.string().uuid() }),
				query: z.object({ notify: z.boolean().optional() }),
				body: UserSchema,
				headers: z.object({ 'x-request-id': z.string() }),
				response: {
					201: z.object({ id: z.string(), name: z.string() }),
					400: z.object({ error: z.string() })
				}
			},
			async (request) => {
				const { orgId } = request.params
				const { notify } = request.query
				const body = await request.json()
				const requestId = request.header('x-request-id')

				return {
					id: '123',
					name: body.name,
					orgId,
					notify,
					requestId
				}
			}
		)

		// Step 2: Verify schema is attached
		expect(hasSchema(handler)).toBe(true)
		expect(handler[SCHEMA_SYMBOL]).toBeDefined()
		expect(handler[SCHEMA_SYMBOL].summary).toBe('Create user')

		// Step 3: Extract schema for OpenAPI generation
		const extracted = await extractSchema(handler)
		expect(extracted).not.toBeNull()
		expect(extracted?.summary).toBe('Create user')
		expect(extracted?.description).toBe('Creates a new user in the organization')
		expect(extracted?.tags).toEqual(['Users', 'Admin'])
		expect(extracted?.body).toBeDefined()
		expect(extracted?.query).toBeDefined()
		expect(extracted?.params).toBeDefined()
		expect(extracted?.headers).toBeDefined()
		expect(extracted?.responses).toBeDefined()

		// Step 4: Execute the handler
		const request = RoboRequest.forTesting({
			method: 'POST',
			path: '/orgs/123e4567-e89b-12d3-a456-426614174000/users',
			params: { orgId: '123e4567-e89b-12d3-a456-426614174000' },
			query: { notify: 'true' },
			headers: { 'x-request-id': 'req-abc-123' },
			body: { name: 'John Doe', email: 'john@example.com' }
		})

		const result = await handler(request, createMockReply())

		// Step 5: Verify handler execution
		expect(result).toMatchObject({
			id: '123',
			name: 'John Doe',
			orgId: '123e4567-e89b-12d3-a456-426614174000',
			requestId: 'req-abc-123'
		})
	})

	it('plain handlers work alongside typed handlers', async () => {
		// Define a typed handler
		const typedHandler = define(
			{
				summary: 'Get users',
				tags: ['Users']
			},
			async () => ({ users: [] })
		)

		// Plain handler (no define wrapper)
		const plainHandler = async () => ({ status: 'ok' })

		// Verify typed handler has schema
		expect(hasSchema(typedHandler)).toBe(true)
		expect(await extractSchema(typedHandler)).not.toBeNull()

		// Verify plain handler has no schema
		expect(hasSchema(plainHandler)).toBe(false)
		expect(await extractSchema(plainHandler)).toBeNull()

		// Both handlers should be callable
		const request = RoboRequest.forTesting({ method: 'GET' })
		const mockReply = createMockReply()

		const typedResult = await typedHandler(request, mockReply)
		expect(typedResult).toEqual({ users: [] })

		const plainResult = await plainHandler()
		expect(plainResult).toEqual({ status: 'ok' })
	})

	it('handles all HTTP method patterns', async () => {
		// GET - typically no body
		const getHandler = define(
			{
				summary: 'Get resource',
				query: z.object({ id: z.string() })
			},
			async (request) => {
				return { id: request.query.id }
			}
		)

		// POST - with body
		const postHandler = define(
			{
				summary: 'Create resource',
				body: z.object({ name: z.string() })
			},
			async (request) => {
				const body = await request.json()
				return { id: '1', name: body.name }
			}
		)

		// PUT - full replacement
		const putHandler = define(
			{
				summary: 'Replace resource',
				params: z.object({ id: z.string() }),
				body: z.object({ name: z.string() })
			},
			async (request) => {
				const body = await request.json()
				return { id: request.params.id, name: body.name }
			}
		)

		// PATCH - partial update
		const patchHandler = define(
			{
				summary: 'Update resource',
				params: z.object({ id: z.string() }),
				body: z.object({ name: z.string().optional() })
			},
			async (request) => {
				const body = await request.json()
				return { id: request.params.id, name: body.name }
			}
		)

		// DELETE - typically no body
		const deleteHandler = define(
			{
				summary: 'Delete resource',
				params: z.object({ id: z.string() })
			},
			async (request) => {
				return { deleted: request.params.id }
			}
		)

		// Verify all handlers have schemas
		expect(hasSchema(getHandler)).toBe(true)
		expect(hasSchema(postHandler)).toBe(true)
		expect(hasSchema(putHandler)).toBe(true)
		expect(hasSchema(patchHandler)).toBe(true)
		expect(hasSchema(deleteHandler)).toBe(true)

		// Execute GET
		const getRequest = RoboRequest.forTesting({
			method: 'GET',
			query: { id: '123' }
		})
		const getResult = await getHandler(getRequest, createMockReply())
		expect(getResult).toEqual({ id: '123' })

		// Execute POST
		const postRequest = RoboRequest.forTesting({
			method: 'POST',
			body: { name: 'Test' }
		})
		const postResult = await postHandler(postRequest, createMockReply())
		expect(postResult).toEqual({ id: '1', name: 'Test' })

		// Execute DELETE
		const deleteRequest = RoboRequest.forTesting({
			method: 'DELETE',
			params: { id: '456' }
		})
		const deleteResult = await deleteHandler(deleteRequest, createMockReply())
		expect(deleteResult).toEqual({ deleted: '456' })
	})

	it('schema extraction produces valid JSON Schema', async () => {
		const handler = define(
			{
				body: z.object({
					name: z.string().min(1).max(100),
					email: z.string().email(),
					age: z.number().int().positive().optional(),
					tags: z.array(z.string())
				})
			},
			async () => ({})
		)

		const extracted = await extractSchema(handler)

		// Verify body schema is valid JSON Schema
		expect(extracted?.body).toBeDefined()
		const bodySchema = extracted?.body as Record<string, unknown>

		// Should have standard JSON Schema properties
		expect(bodySchema.type).toBe('object')
		expect(bodySchema.properties).toBeDefined()
		expect(bodySchema.required).toBeDefined()
	})

	it('handles complex nested schemas', async () => {
		const AddressSchema = z.object({
			street: z.string(),
			city: z.string(),
			country: z.string()
		})

		const CompanySchema = z.object({
			name: z.string(),
			address: AddressSchema
		})

		const handler = define(
			{
				summary: 'Create company',
				body: CompanySchema
			},
			async (request) => {
				const body = await request.json()
				return { id: '1', name: body.name, address: body.address }
			}
		)

		const extracted = await extractSchema(handler)
		expect(extracted?.body).toBeDefined()

		// Execute with nested data
		const request = RoboRequest.forTesting({
			method: 'POST',
			body: {
				name: 'Acme Inc',
				address: {
					street: '123 Main St',
					city: 'New York',
					country: 'USA'
				}
			}
		})

		const result = await handler(request, createMockReply())
		expect(result).toMatchObject({
			id: '1',
			name: 'Acme Inc',
			address: {
				street: '123 Main St',
				city: 'New York',
				country: 'USA'
			}
		})
	})

	it('metadata is preserved through extraction', async () => {
		const handler = define(
			{
				summary: 'Short summary',
				description: 'Detailed description of the endpoint',
				tags: ['Tag1', 'Tag2', 'Tag3'],
				deprecated: true
			},
			async () => ({ ok: true })
		)

		const extracted = await extractSchema(handler)

		expect(extracted?.summary).toBe('Short summary')
		expect(extracted?.description).toBe('Detailed description of the endpoint')
		expect(extracted?.tags).toEqual(['Tag1', 'Tag2', 'Tag3'])
		expect(extracted?.deprecated).toBe(true)
	})

	it('response schemas are extracted by status code', async () => {
		const handler = define(
			{
				response: {
					200: z.object({ data: z.array(z.string()) }),
					201: z.object({ id: z.string(), created: z.boolean() }),
					400: z.object({ error: z.string(), code: z.number() }),
					404: z.object({ message: z.string() }),
					500: z.object({ error: z.string() })
				}
			},
			async () => ({})
		)

		const extracted = await extractSchema(handler)

		expect(extracted?.responses).toBeDefined()
		expect(Object.keys(extracted?.responses ?? {})).toHaveLength(5)
		expect(extracted?.responses?.['200']).toBeDefined()
		expect(extracted?.responses?.['201']).toBeDefined()
		expect(extracted?.responses?.['400']).toBeDefined()
		expect(extracted?.responses?.['404']).toBeDefined()
		expect(extracted?.responses?.['500']).toBeDefined()
	})
})
