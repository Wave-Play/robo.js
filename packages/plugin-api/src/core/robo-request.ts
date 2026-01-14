import type { IncomingMessage } from 'node:http'

const INTERNALS = Symbol('internal request')

interface FromOptions {
	body?: Buffer
	skipBody?: boolean
}

/**
 * Options for creating a RoboRequest for testing purposes
 */
export interface ForTestingOptions {
	/** HTTP method (defaults to 'GET') */
	method?: string
	/** URL path (defaults to '/test') */
	path?: string
	/** URL parameters extracted from dynamic segments like [id] */
	params?: Record<string, string>
	/** Query string parameters */
	query?: Record<string, string | string[]>
	/** Request headers */
	headers?: Record<string, string>
	/** Request body (will be JSON stringified if object) */
	body?: unknown
	/** Base URL for constructing absolute URLs (defaults to 'http://localhost:3000') */
	baseUrl?: string
}

/**
 * Extends the [Web Request API](https://developer.mozilla.org/docs/Web/API/Request) with additional convenience methods.
 */
export class RoboRequest extends Request {
	[INTERNALS]: {
		params: Record<string, string>
		raw: IncomingMessage
	}

	private constructor(input: RequestInfo | URL, init: RequestInit = {}) {
		const url = typeof input !== 'string' && 'url' in input ? input.url : String(input)
		validateURL(url)

		if (input instanceof Request) {
			super(input, init)
		} else {
			super(url, init)
		}

		this[INTERNALS] = {
			params: {},
			raw: {} as IncomingMessage
		}
	}

	public get params(): Record<string, string> {
		return this[INTERNALS].params
	}

	public get query(): Record<string, string | string[]> {
		const url = new URL(this.url)
		const query = Object.fromEntries(url.searchParams.entries())
		return query
	}

	public get raw(): IncomingMessage {
		return this[INTERNALS].raw
	}

	public static async from(req: IncomingMessage, options?: FromOptions): Promise<RoboRequest> {
		const rawProtoHeader = req.headers['x-forwarded-proto'] // may return "https, http"
		const rawProto = Array.isArray(rawProtoHeader) ? rawProtoHeader[0] : rawProtoHeader || 'http'
		const protocol = rawProto.split(',')[0].trim()
		const host = req.headers.host
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const path = (req as any).originalUrl || req.url
		const url = `${protocol}://${host}${path}`

		const method = req.method || 'GET'
		const headers = new Headers(req.headers as HeadersInit)

		let body: BodyInit | null | Buffer = options?.body ?? null
		if (!options?.skipBody && !options?.body && !['GET', 'HEAD'].includes(method)) {
			body = await new Promise<Buffer>((resolve, reject) => {
				const chunks: Uint8Array[] = []
				req.on('data', (chunk) => chunks.push(chunk))
				req.on('end', () => resolve(Buffer.concat(chunks)))
				req.on('error', reject)
			})
		}

		const request = new RoboRequest(url, { body: body as BodyInit, headers, method })
		request[INTERNALS].raw = req

		return request
	}

	/**
	 * Creates a RoboRequest for testing purposes without requiring an IncomingMessage.
	 * This factory method allows creating fully-functional RoboRequest instances
	 * with params, query, headers, and body for unit testing API handlers.
	 *
	 * @example
	 * ```typescript
	 * const request = RoboRequest.forTesting({
	 *   method: 'POST',
	 *   path: '/users',
	 *   params: { id: '123' },
	 *   query: { include: 'profile' },
	 *   body: { name: 'John' }
	 * })
	 * const response = await handler(request)
	 * ```
	 */
	public static forTesting(options: ForTestingOptions = {}): RoboRequest {
		const {
			method = 'GET',
			path = '/test',
			params = {},
			query = {},
			headers = {},
			body,
			baseUrl = 'http://localhost:3000'
		} = options

		// Build the full URL with query parameters
		const url = new URL(path, baseUrl)
		for (const [key, value] of Object.entries(query)) {
			if (Array.isArray(value)) {
				value.forEach((v) => url.searchParams.append(key, v))
			} else {
				url.searchParams.set(key, value)
			}
		}

		// Prepare request init
		const init: RequestInit = {
			method,
			headers: new Headers(headers)
		}

		// Handle body for non-GET/HEAD requests
		if (body !== undefined && !['GET', 'HEAD'].includes(method)) {
			if (typeof body === 'string') {
				init.body = body
			} else if (body instanceof FormData || body instanceof URLSearchParams) {
				init.body = body
			} else {
				init.body = JSON.stringify(body)
				;(init.headers as Headers).set('Content-Type', 'application/json')
			}
		}

		const request = new RoboRequest(url.toString(), init)
		request[INTERNALS].params = params

		return request
	}
}

export function applyParams(request: RoboRequest, params: Record<string, string>) {
	request[INTERNALS].params = params
}

export function validateURL(url: string | URL): string {
	try {
		return String(new URL(String(url)))
	} catch (error) {
		throw new Error(`URL is malformed "${String(url)}". Please use only absolute URLs`, { cause: error })
	}
}
