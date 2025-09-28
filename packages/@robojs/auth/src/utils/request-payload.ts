import type { RoboRequest } from '@robojs/server'

type PayloadSource = 'json' | 'form' | 'empty'

interface PayloadState {
	data: Record<string, unknown>
	source: PayloadSource
}

/** Utility handle for inspecting and mutating a parsed request payload. */
export interface RequestPayloadHandle {
	readonly source: PayloadSource
	get<T extends Record<string, unknown> = Record<string, unknown>>(): T
	replace(data: Record<string, unknown>): void
	assign(partial: Record<string, unknown>): void
}

const EMAIL_PASSWORD_PAYLOAD_SYMBOL = Symbol.for('robojs.auth.emailPasswordPayload')

function getCarrier(request: RoboRequest): Record<symbol, unknown> {
	return request as unknown as Record<symbol, unknown>
}

function ensureState(request: RoboRequest): PayloadState | undefined {
	return getCarrier(request)[EMAIL_PASSWORD_PAYLOAD_SYMBOL] as PayloadState | undefined
}

function storeState(request: RoboRequest, state: PayloadState): void {
	getCarrier(request)[EMAIL_PASSWORD_PAYLOAD_SYMBOL] = state
}

async function parseBody(request: RoboRequest): Promise<PayloadState> {
	const header = request.headers.get('content-type')?.toLowerCase() ?? ''
	const source = typeof request.clone === 'function' ? (request.clone() as RoboRequest) : request
	if (header.includes('application/json')) {
		try {
			// Parse JSON payloads but coerce non-object bodies to an empty object for safety.
			const json = (await source.json()) as unknown
			if (json && typeof json === 'object' && !Array.isArray(json)) {
				return { data: json as Record<string, unknown>, source: 'json' }
			}
			return { data: {}, source: 'json' }
		} catch {
			return { data: {}, source: 'json' }
		}
	}

	if (header.includes('application/x-www-form-urlencoded') || header.includes('multipart/form-data')) {
		try {
			const form = await source.formData()
			const map: Record<string, unknown> = {}
			form.forEach((value, key) => {
				// Preserve repeated keys by collapsing values into arrays as they appear.
				if (map[key] === undefined) {
					map[key] = value
					return
				}
				const existing = map[key]
				if (Array.isArray(existing)) {
					existing.push(value)
				} else {
					map[key] = [existing, value]
				}
			})

			return { data: map, source: 'form' }
		} catch {
			return { data: {}, source: 'form' }
		}
	}

	return { data: {}, source: 'empty' }
}

function createHandle(request: RoboRequest, state: PayloadState): RequestPayloadHandle {
	return {
		get<T extends Record<string, unknown>>() {
			return state.data as T
		},
		replace(data) {
			state.data = data
			storeState(request, state)
		},
		assign(partial) {
			Object.assign(state.data, partial)
			storeState(request, state)
		},
		get source() {
			return state.source
		}
	}
}

/**
 * Parses the Robo request body once and exposes a reusable payload helper.
 *
 * @param request - Incoming Robo request whose body should be cached and inspected.
 * @returns A payload handle that exposes `get`, `replace`, and `assign` helpers.
 *
 * @example
 * ```ts
 * const payload = await getRequestPayload(request)
 * const { email } = payload.get<{ email: string }>()
 * ```
 */
export async function getRequestPayload(request: RoboRequest): Promise<RequestPayloadHandle> {
	const existing = ensureState(request)
	if (existing) {
		// Return the cached payload so multiple consumers share the same mutation surface.
		return createHandle(request, existing)
	}

	const parsed = await parseBody(request)
	storeState(request, parsed)

	return createHandle(request, parsed)
}
