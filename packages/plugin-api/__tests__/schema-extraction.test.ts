import { describe, expect, it } from '@jest/globals'
import { extractSchema, hasSchema } from '../src/core/schema-extractor.js'
import { define } from '../src/core/typed-endpoint.js'
import { z } from 'zod'

describe('extractSchema()', () => {
	it('extracts metadata from defined handler', async () => {
		const handler = define(
			{
				summary: 'Test endpoint',
				tags: ['test'],
				body: z.object({ name: z.string() })
			},
			async () => ({})
		)

		const extracted = await extractSchema(handler)

		expect(extracted?.summary).toBe('Test endpoint')
		expect(extracted?.tags).toEqual(['test'])
		expect(extracted?.body).toBeDefined()
	})

	it('returns null for plain handlers', async () => {
		const handler = async () => ({})
		const result = await extractSchema(handler)
		expect(result).toBeNull()
	})

	it('hasSchema returns true for defined handlers', () => {
		const defined = define({}, async () => ({}))
		const plain = async () => ({})

		expect(hasSchema(defined)).toBe(true)
		expect(hasSchema(plain)).toBe(false)
	})

	it('handles schema without zod-to-json-schema gracefully', async () => {
		const handler = define(
			{
				summary: 'Test',
				description: 'Description'
			},
			async () => ({})
		)

		const extracted = await extractSchema(handler)

		// Should return metadata even without zod-to-json-schema
		expect(extracted?.summary).toBe('Test')
		expect(extracted?.description).toBe('Description')
	})

	it('returns null for null input', async () => {
		const result = await extractSchema(null)
		expect(result).toBeNull()
	})

	it('returns null for undefined input', async () => {
		const result = await extractSchema(undefined)
		expect(result).toBeNull()
	})

	it('returns null for non-function input', async () => {
		const result = await extractSchema({ notAFunction: true })
		expect(result).toBeNull()
	})

	it('extracts deprecated flag', async () => {
		const handler = define(
			{
				deprecated: true
			},
			async () => ({})
		)

		const extracted = await extractSchema(handler)

		expect(extracted?.deprecated).toBe(true)
	})

	it('extracts query schema', async () => {
		const handler = define(
			{
				query: z.object({
					page: z.number(),
					limit: z.number().optional()
				})
			},
			async () => ({})
		)

		const extracted = await extractSchema(handler)

		expect(extracted?.query).toBeDefined()
	})

	it('extracts params schema', async () => {
		const handler = define(
			{
				params: z.object({
					id: z.string(),
					slug: z.string()
				})
			},
			async () => ({})
		)

		const extracted = await extractSchema(handler)

		expect(extracted?.params).toBeDefined()
	})

	it('extracts headers schema', async () => {
		const handler = define(
			{
				headers: z.object({
					'x-api-key': z.string(),
					'x-request-id': z.string().optional()
				})
			},
			async () => ({})
		)

		const extracted = await extractSchema(handler)

		expect(extracted?.headers).toBeDefined()
	})

	it('extracts response schemas by status code', async () => {
		const handler = define(
			{
				response: {
					200: z.object({ success: z.boolean() }),
					400: z.object({ error: z.string() }),
					404: z.object({ message: z.string() })
				}
			},
			async () => ({})
		)

		const extracted = await extractSchema(handler)

		expect(extracted?.responses).toBeDefined()
		expect(extracted?.responses?.['200']).toBeDefined()
		expect(extracted?.responses?.['400']).toBeDefined()
		expect(extracted?.responses?.['404']).toBeDefined()
	})

	it('extracts complete schema with all fields', async () => {
		const handler = define(
			{
				summary: 'Create user',
				description: 'Creates a new user in the system',
				tags: ['Users', 'Admin'],
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
			async () => ({})
		)

		const extracted = await extractSchema(handler)

		expect(extracted?.summary).toBe('Create user')
		expect(extracted?.description).toBe('Creates a new user in the system')
		expect(extracted?.tags).toEqual(['Users', 'Admin'])
		expect(extracted?.deprecated).toBe(false)
		expect(extracted?.body).toBeDefined()
		expect(extracted?.query).toBeDefined()
		expect(extracted?.params).toBeDefined()
		expect(extracted?.headers).toBeDefined()
		expect(extracted?.responses).toBeDefined()
		expect(Object.keys(extracted?.responses ?? {})).toEqual(['201', '400'])
	})
})

describe('hasSchema()', () => {
	it('returns false for null', () => {
		expect(hasSchema(null)).toBe(false)
	})

	it('returns false for undefined', () => {
		expect(hasSchema(undefined)).toBe(false)
	})

	it('returns false for non-function values', () => {
		expect(hasSchema('string')).toBe(false)
		expect(hasSchema(123)).toBe(false)
		expect(hasSchema({})).toBe(false)
		expect(hasSchema([])).toBe(false)
	})

	it('returns true for defined handlers with schema', () => {
		const handler = define(
			{
				body: z.object({ name: z.string() })
			},
			async () => ({})
		)

		expect(hasSchema(handler)).toBe(true)
	})

	it('returns true for defined handlers with empty schema', () => {
		const handler = define({}, async () => ({}))
		expect(hasSchema(handler)).toBe(true)
	})
})
