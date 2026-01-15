import type { ZodObject, ZodRawShape, ZodType, z } from 'zod'
import type { RoboRequest } from './robo-request.js'
import type { RoboReply } from './types.js'

// ============================================================
// Schema Definition Types
// ============================================================

type HttpStatusCode = 200 | 201 | 204 | 400 | 401 | 403 | 404 | 409 | 422 | 500

type InferSchema<T> = T extends ZodType<infer U> ? U : never

type HeadersSchema = ZodObject<ZodRawShape>

type ResponseSchemas = Partial<Record<HttpStatusCode, ZodType>>

/**
 * Endpoint schema definition for typed APIs.
 */
export interface EndpointSchema {
	summary?: string
	description?: string
	tags?: string[]
	deprecated?: boolean
	body?: ZodType
	query?: ZodObject<ZodRawShape>
	params?: ZodObject<ZodRawShape>
	headers?: HeadersSchema
	response?: ResponseSchemas
}

// ============================================================
// Typed Request Interface
// ============================================================

/**
 * Enhanced request with typed accessors based on schema.
 *
 * CRITICAL: Body is NOT auto-parsed. Call `await request.json()`
 * which returns the typed result.
 */
export interface TypedRoboRequest<TSchema extends EndpointSchema>
	extends Omit<RoboRequest, 'params' | 'query' | 'json' | 'header'> {
	readonly query: TSchema['query'] extends ZodType
		? InferSchema<TSchema['query']>
		: Record<string, string | string[]>

	readonly params: TSchema['params'] extends ZodType ? InferSchema<TSchema['params']> : Record<string, string>

	// Typed header accessor - overloaded
	header<K extends TSchema['headers'] extends ZodObject<infer Shape extends ZodRawShape> ? keyof Shape & string : never>(
		name: K
	): TSchema['headers'] extends ZodObject<infer Shape extends ZodRawShape>
		? K extends keyof Shape
			? Shape[K] extends ZodType
				? z.infer<Shape[K]>
				: string | null
			: string | null
		: string | null
	header(name: string): string | null

	// Typed JSON parsing
	json(): Promise<TSchema['body'] extends ZodType ? InferSchema<TSchema['body']> : unknown>
}

// ============================================================
// Handler Types
// ============================================================

export type TypedHandler<TSchema extends EndpointSchema> = (
	request: TypedRoboRequest<TSchema>,
	reply: RoboReply
) => unknown | Promise<unknown>

// ============================================================
// Schema Symbol for Build-Time Extraction
// ============================================================

export const SCHEMA_SYMBOL = Symbol.for('robojs.endpoint.schema')

export interface DefinedEndpoint<TSchema extends EndpointSchema> {
	(request: RoboRequest, reply: RoboReply): unknown | Promise<unknown>
	[SCHEMA_SYMBOL]: TSchema
}

/**
 * Define a typed API endpoint with optional Zod schema.
 *
 * Provides:
 * - TypeScript inference for request.json(), request.query, request.params
 * - Type-safe header access via request.header('x-api-key')
 * - OpenAPI 3.1 spec generation during build
 *
 * IMPORTANT: Body is NOT auto-parsed. Call `await request.json()`.
 *
 * @example
 * export const POST = define({
 *   summary: 'Create user',
 *   body: z.object({ name: z.string() }),
 *   response: { 201: z.object({ id: z.string() }) }
 * }, async (request) => {
 *   const body = await request.json()  // Typed!
 *   return { id: '123' }
 * })
 */
export function define<TSchema extends EndpointSchema>(
	schema: TSchema,
	handler: TypedHandler<TSchema>
): DefinedEndpoint<TSchema> {
	// Create wrapper that adds typed header accessor
	const wrappedHandler = async (request: RoboRequest, reply: RoboReply): Promise<unknown> => {
		// Add typed header() method via proxy
		const typedRequest = new Proxy(request, {
			get(target, prop, receiver) {
				if (prop === 'header') {
					return (name: string) => target.headers.get(name)
				}
				return Reflect.get(target, prop, receiver)
			}
		}) as TypedRoboRequest<TSchema>

		return handler(typedRequest, reply)
	}

	// Attach schema for build-time extraction
	const definedHandler = wrappedHandler as DefinedEndpoint<TSchema>
	definedHandler[SCHEMA_SYMBOL] = schema

	return definedHandler
}
