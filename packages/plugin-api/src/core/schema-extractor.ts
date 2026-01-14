import { SCHEMA_SYMBOL } from './typed-endpoint.js'
import type { EndpointSchema } from './typed-endpoint.js'
import * as z from 'zod'
export interface ExtractedSchema {
	summary?: string
	description?: string
	tags?: string[]
	deprecated?: boolean
	body?: object // JSON Schema
	query?: object // JSON Schema
	params?: object // JSON Schema
	headers?: object // JSON Schema
	responses?: Record<string, object> // Status code -> JSON Schema
}

/**
 * Extract schema from a handler created with define().
 * Returns null if handler has no schema.
 */
export async function extractSchema(handler: unknown): Promise<ExtractedSchema | null> {
	if (!handler || typeof handler !== 'function') {
		return null
	}

	const schema = (handler as any)[SCHEMA_SYMBOL] as EndpointSchema | undefined
	if (!schema) {
		return null
	}

	return convertToExtracted(schema)
}

/**
 * Convert Zod schemas to JSON Schema format using Zod v4's native toJSONSchema().
 */
async function convertToExtracted(schema: EndpointSchema): Promise<ExtractedSchema> {
	const extracted: ExtractedSchema = {
		summary: schema.summary,
		description: schema.description,
		tags: schema.tags,
		deprecated: schema.deprecated
	}

	const options = { target: 'openapi-3.0' as const }

	if (schema.body) {
		extracted.body = z.toJSONSchema(schema.body, options) as object
	}
	if (schema.query) {
		extracted.query = z.toJSONSchema(schema.query, options) as object
	}
	if (schema.params) {
		extracted.params = z.toJSONSchema(schema.params, options) as object
	}
	if (schema.headers) {
		extracted.headers = z.toJSONSchema(schema.headers, options) as object
	}
	if (schema.response) {
		extracted.responses = {}
		for (const [status, responseSchema] of Object.entries(schema.response)) {
			if (responseSchema) {
				extracted.responses[status] = z.toJSONSchema(responseSchema, options) as object
			}
		}
	}

	return extracted
}

/**
 * Check if a handler has a schema attached.
 */
export function hasSchema(handler: unknown): boolean {
	return !!(handler && typeof handler === 'function' && (handler as any)[SCHEMA_SYMBOL])
}
