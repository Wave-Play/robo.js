import { extractSchema, hasSchema } from './schema-extractor.js'
import type { ExtractedSchema } from './schema-extractor.js'
import { logger } from './logger.js'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'] as const

// ============================================================
// OpenAPI 3.1 Type Definitions (Complete Spec Coverage)
// ============================================================

interface OpenAPI31Spec {
	openapi: '3.1.0'
	info: InfoObject
	jsonSchemaDialect?: string
	servers?: ServerObject[]
	paths?: Record<string, PathItem>
	webhooks?: Record<string, PathItem>
	components?: ComponentsObject
	security?: SecurityRequirement[]
	tags?: TagObject[]
	externalDocs?: ExternalDocumentation
}

interface InfoObject {
	title: string
	version: string
	summary?: string
	description?: string
	termsOfService?: string
	contact?: ContactObject
	license?: LicenseObject
}

interface ContactObject {
	name?: string
	url?: string
	email?: string
}

interface LicenseObject {
	name: string
	identifier?: string // SPDX identifier
	url?: string
}

interface ServerObject {
	url: string
	description?: string
	variables?: Record<string, ServerVariable>
}

interface ServerVariable {
	enum?: string[]
	default: string
	description?: string
}

interface ComponentsObject {
	schemas?: Record<string, object>
	responses?: Record<string, ResponseObject>
	parameters?: Record<string, Parameter>
	examples?: Record<string, ExampleObject>
	requestBodies?: Record<string, RequestBody>
	headers?: Record<string, HeaderObject>
	securitySchemes?: Record<string, SecurityScheme>
	links?: Record<string, LinkObject>
	callbacks?: Record<string, Record<string, PathItem>>
	pathItems?: Record<string, PathItem>
}

interface SecurityScheme {
	type: 'apiKey' | 'http' | 'mutualTLS' | 'oauth2' | 'openIdConnect'
	description?: string
	name?: string // Required for apiKey
	in?: 'query' | 'header' | 'cookie' // Required for apiKey
	scheme?: string // Required for http
	bearerFormat?: string // For http bearer
	flows?: OAuthFlows // Required for oauth2
	openIdConnectUrl?: string // Required for openIdConnect
}

interface OAuthFlows {
	implicit?: OAuthFlow
	password?: OAuthFlow
	clientCredentials?: OAuthFlow
	authorizationCode?: OAuthFlow
}

interface OAuthFlow {
	authorizationUrl?: string
	tokenUrl?: string
	refreshUrl?: string
	scopes: Record<string, string>
}

interface TagObject {
	name: string
	description?: string
	externalDocs?: ExternalDocumentation
}

interface ExternalDocumentation {
	url: string
	description?: string
}

interface SecurityRequirement {
	[name: string]: string[]
}

interface PathItem {
	get?: Operation
	post?: Operation
	put?: Operation
	delete?: Operation
	patch?: Operation
	options?: Operation
	head?: Operation
	summary?: string
	description?: string
}

interface Operation {
	operationId?: string
	summary?: string
	description?: string
	tags?: string[]
	deprecated?: boolean
	parameters?: Parameter[]
	requestBody?: RequestBody
	responses: Record<string, ResponseObject>
}

interface Parameter {
	name: string
	in: 'query' | 'path' | 'header'
	required?: boolean
	description?: string
	schema: object
}

interface RequestBody {
	required?: boolean
	description?: string
	content: Record<string, { schema: object }>
}

interface ResponseObject {
	description: string
	content?: Record<string, { schema: object }>
}

interface ExampleObject {
	summary?: string
	description?: string
	value?: unknown
	externalValue?: string
}

interface HeaderObject {
	description?: string
	required?: boolean
	schema?: object
}

interface LinkObject {
	operationRef?: string
	operationId?: string
	parameters?: Record<string, unknown>
	requestBody?: unknown
	description?: string
}

// ============================================================
// Generator Options
// ============================================================

export interface OpenAPIGeneratorOptions {
	// Info
	title?: string
	version?: string
	summary?: string
	description?: string
	termsOfService?: string
	contact?: ContactObject
	license?: LicenseObject

	// Servers
	servers?: ServerObject[]

	// Security (global)
	security?: SecurityRequirement[]
	securitySchemes?: Record<string, SecurityScheme>

	// Tags
	tags?: TagObject[]

	// External docs
	externalDocs?: ExternalDocumentation

	// Output
	outputPath?: string
}

// Plugin config type (add to existing PluginConfig interface)
export interface OpenAPIConfig {
	/** Set to false to completely disable OpenAPI generation */
	enabled?: boolean

	// All OpenAPIGeneratorOptions fields
	title?: string
	version?: string
	summary?: string
	description?: string
	termsOfService?: string
	contact?: ContactObject
	license?: LicenseObject
	servers?: ServerObject[]
	security?: SecurityRequirement[]
	securitySchemes?: Record<string, SecurityScheme>
	tags?: TagObject[]
	externalDocs?: ExternalDocumentation
}

// HandlerEntry type (simplified version for type safety)
export interface HandlerEntry {
	key: string
	path: string
}

// ============================================================
// Generator Implementation
// ============================================================

/**
 * Generate OpenAPI 3.1 spec from API route entries.
 */
export async function generateOpenAPISpec(
	entries: HandlerEntry[],
	buildDir: string,
	options: OpenAPIGeneratorOptions = {}
): Promise<void> {
	if (entries.length === 0) {
		logger.debug('No API routes found. Skipping OpenAPI generation.')
		return
	}

	const spec: OpenAPI31Spec = {
		openapi: '3.1.0',
		info: {
			title: options.title ?? 'API',
			version: options.version ?? '1.0.0',
			summary: options.summary,
			description: options.description,
			termsOfService: options.termsOfService,
			contact: options.contact,
			license: options.license
		},
		servers: options.servers,
		paths: {},
		components: options.securitySchemes ? { securitySchemes: options.securitySchemes } : undefined,
		security: options.security,
		tags: options.tags,
		externalDocs: options.externalDocs
	}

	let hasAnySchemas = false

	for (const entry of entries) {
		const routePath = convertRouteToOpenAPIPath(entry.key)

		try {
			const modulePath = path.resolve(buildDir, entry.path)
			const module = await import(modulePath)

			for (const method of HTTP_METHODS) {
				const handler = module[method]
				if (!handler || !hasSchema(handler)) continue

				const extracted = await extractSchema(handler)
				if (!extracted) continue

				hasAnySchemas = true

				if (!spec.paths![routePath]) {
					spec.paths![routePath] = {}
				}

				const operation = buildOperation(extracted, entry.key, method)
				const methodKey = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch' | 'options' | 'head'
				spec.paths![routePath][methodKey] = operation
			}
		} catch (error) {
			logger.debug(`Could not process ${entry.key}: ${error}`)
		}
	}

	if (!hasAnySchemas) {
		logger.debug('No typed endpoints found. Skipping OpenAPI generation.')
		return
	}

	// Clean up undefined fields
	const cleanSpec = JSON.parse(JSON.stringify(spec))

	const outputPath = options.outputPath ?? path.join(process.cwd(), '.robo', 'openapi.json')
	await mkdir(path.dirname(outputPath), { recursive: true })
	await writeFile(outputPath, JSON.stringify(cleanSpec, null, 2))

	logger.info(`Generated OpenAPI 3.1 spec: ${path.relative(process.cwd(), outputPath)}`)
}

export function convertRouteToOpenAPIPath(routeKey: string): string {
	// users/[id] -> /users/{id}
	// users/[...slug] -> /users/{slug}
	// users/[[...slug]] -> /users/{slug}
	return (
		'/' +
		routeKey
			.replace(/\[\[\.\.\.([^\]]+)\]\]/g, '{$1}') // Optional catch-all (must come first!)
			.replace(/\[\.\.\.([^\]]+)\]/g, '{$1}') // Catch-all
			.replace(/\[([^\]]+)\]/g, '{$1}') // Regular params
	)
}

function buildOperation(schema: ExtractedSchema, routeKey: string, method: string): Operation {
	const operation: Operation = {
		operationId: `${method.toLowerCase()}_${routeKey.replace(/[^a-zA-Z0-9]/g, '_')}`,
		summary: schema.summary,
		description: schema.description,
		tags: schema.tags,
		deprecated: schema.deprecated,
		responses: {}
	}

	// Build parameters
	const parameters: Parameter[] = []

	if (schema.query) {
		const props = (schema.query as any).properties ?? {}
		const required = (schema.query as any).required ?? []
		for (const [name, propSchema] of Object.entries(props)) {
			parameters.push({
				name,
				in: 'query',
				required: required.includes(name),
				schema: propSchema as object
			})
		}
	}

	if (schema.params) {
		const props = (schema.params as any).properties ?? {}
		for (const [name, propSchema] of Object.entries(props)) {
			parameters.push({
				name,
				in: 'path',
				required: true,
				schema: propSchema as object
			})
		}
	}

	if (schema.headers) {
		const props = (schema.headers as any).properties ?? {}
		const required = (schema.headers as any).required ?? []
		for (const [name, propSchema] of Object.entries(props)) {
			parameters.push({
				name,
				in: 'header',
				required: required.includes(name),
				schema: propSchema as object
			})
		}
	}

	if (parameters.length > 0) {
		operation.parameters = parameters
	}

	// Request body for POST/PUT/PATCH
	if (schema.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
		operation.requestBody = {
			required: true,
			content: {
				'application/json': { schema: schema.body }
			}
		}
	}

	// Responses
	if (schema.responses && Object.keys(schema.responses).length > 0) {
		for (const [status, responseSchema] of Object.entries(schema.responses)) {
			operation.responses[status] = {
				description: getStatusDescription(parseInt(status)),
				content: {
					'application/json': { schema: responseSchema }
				}
			}
		}
	} else {
		operation.responses['200'] = { description: 'Successful response' }
	}

	return operation
}

function getStatusDescription(status: number): string {
	const descriptions: Record<number, string> = {
		200: 'Successful response',
		201: 'Created',
		204: 'No content',
		400: 'Bad request',
		401: 'Unauthorized',
		403: 'Forbidden',
		404: 'Not found',
		409: 'Conflict',
		422: 'Unprocessable entity',
		500: 'Internal server error'
	}
	return descriptions[status] ?? `${status} response`
}
