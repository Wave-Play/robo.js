import type { IncomingMessage } from 'node:http'

const INTERNALS = Symbol('internal request')

interface FromOptions {
	body?: Buffer
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
		const url = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}${req.url}`
		const method = req.method || 'GET'
		const headers = new Headers(req.headers as HeadersInit)
		let body: BodyInit | null = options?.body

		if (!options?.body && !['GET', 'HEAD'].includes(method)) {
			body = await new Promise<Buffer>((resolve, reject) => {
				const chunks: Buffer[] = []
				req.on('data', (chunk) => chunks.push(chunk))
				req.on('end', () => resolve(Buffer.concat(chunks)))
				req.on('error', reject)
			})
		}

		const request = new RoboRequest(url, { body, headers, method })
		request[INTERNALS].raw = req

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
