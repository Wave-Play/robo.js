import { describe, expect, it, jest } from '@jest/globals'
import type { RoboReply } from '../src/core/types.js'
import { RoboRequest } from '../src/core/robo-request.js'
import { define, SCHEMA_SYMBOL } from '../src/core/typed-endpoint.js'
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

describe('define()', () => {
	it('attaches schema symbol to handler', () => {
		const schema = { body: z.object({ name: z.string() }) }
		const handler = define(schema, async () => ({ ok: true }))

		expect(handler[SCHEMA_SYMBOL]).toBe(schema)
	})

	it('keeps handler callable', async () => {
		const handler = define({}, async () => ({ called: true }))
		const request = RoboRequest.forTesting({ method: 'GET' })

		const result = await handler(request, createMockReply())

		expect(result).toEqual({ called: true })
	})

	it('provides a header accessor backed by request headers', async () => {
		const handler = define(
			{
				headers: z.object({ 'x-api-key': z.string() })
			},
			async (request) => ({
				key: request.header('x-api-key'),
				missing: request.header('x-missing')
			})
		)

		const request = RoboRequest.forTesting({
			headers: { 'x-api-key': 'secret123' }
		})

		const result = await handler(request, createMockReply())

		expect(result).toEqual({ key: 'secret123', missing: null })
	})

	it('does not pre-parse the request body', async () => {
		const handler = define(
			{
				body: z.object({ name: z.string() })
			},
			async (request) => {
				const before = request.bodyUsed
				const body = await request.json()

				return { before, body }
			}
		)

		const request = RoboRequest.forTesting({
			method: 'POST',
			body: { name: 'Robo' }
		})

		const result = await handler(request, createMockReply())

		expect(result).toEqual({ before: false, body: { name: 'Robo' } })
	})

	it('works with empty schema', async () => {
		const handler = define({}, async () => ({ simple: true }))

		expect(handler[SCHEMA_SYMBOL]).toEqual({})

		const request = RoboRequest.forTesting({ method: 'GET' })
		const result = await handler(request, createMockReply())

		expect(result).toEqual({ simple: true })
	})

	it('preserves all schema metadata', () => {
		const schema = {
			summary: 'Test endpoint',
			description: 'A test endpoint for unit testing',
			tags: ['test', 'unit'],
			deprecated: true,
			body: z.object({ name: z.string() }),
			query: z.object({ page: z.number().optional() }),
			params: z.object({ id: z.string() }),
			headers: z.object({ 'x-api-key': z.string() }),
			response: {
				200: z.object({ success: z.boolean() }),
				400: z.object({ error: z.string() })
			}
		}
		const handler = define(schema, async () => ({ success: true }))

		expect(handler[SCHEMA_SYMBOL]).toBe(schema)
		expect(handler[SCHEMA_SYMBOL].summary).toBe('Test endpoint')
		expect(handler[SCHEMA_SYMBOL].description).toBe('A test endpoint for unit testing')
		expect(handler[SCHEMA_SYMBOL].tags).toEqual(['test', 'unit'])
		expect(handler[SCHEMA_SYMBOL].deprecated).toBe(true)
	})

	it('exposes params from request', async () => {
		const handler = define(
			{
				params: z.object({ userId: z.string(), postId: z.string() })
			},
			async (request) => ({
				userId: request.params.userId,
				postId: request.params.postId
			})
		)

		const request = RoboRequest.forTesting({
			method: 'GET',
			params: { userId: 'user-123', postId: 'post-456' }
		})

		const result = await handler(request, createMockReply())

		expect(result).toEqual({ userId: 'user-123', postId: 'post-456' })
	})

	it('exposes query from request', async () => {
		const handler = define(
			{
				query: z.object({ page: z.number(), limit: z.number().optional() })
			},
			async (request) => ({
				page: request.query.page,
				limit: request.query.limit
			})
		)

		const request = RoboRequest.forTesting({
			method: 'GET',
			query: { page: '1', limit: '10' }
		})

		const result = await handler(request, createMockReply())

		expect(result).toEqual({ page: '1', limit: '10' })
	})

	it('passes reply object to handler', async () => {
		const mockReply = createMockReply()
		let capturedReply: RoboReply | null = null

		const handler = define({}, async (_request, reply) => {
			capturedReply = reply
			return { ok: true }
		})

		const request = RoboRequest.forTesting({ method: 'GET' })
		await handler(request, mockReply)

		expect(capturedReply).toBe(mockReply)
	})

	it('handles async handlers correctly', async () => {
		const handler = define({}, async () => {
			// Simulate async operation
			await new Promise((resolve) => setTimeout(resolve, 10))
			return { async: true }
		})

		const request = RoboRequest.forTesting({ method: 'GET' })
		const result = await handler(request, createMockReply())

		expect(result).toEqual({ async: true })
	})

	it('handler can throw errors', async () => {
		const handler = define({}, async () => {
			throw new Error('Test error')
		})

		const request = RoboRequest.forTesting({ method: 'GET' })

		await expect(handler(request, createMockReply())).rejects.toThrow('Test error')
	})
})
