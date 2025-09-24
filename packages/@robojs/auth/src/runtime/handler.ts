import { Auth } from '@auth/core'
import type { AuthConfig } from '@auth/core'
import type { RoboRequest, RoboReply } from '@robojs/server'
import { authLogger } from '../utils/logger.js'

export type AuthRequestHandler = (req: RoboRequest, res: RoboReply) => Promise<Response>

/**
 * Bridges Robo.js `RoboRequest` objects to Auth.js' `Auth` handler.
 *
 * @example
 * ```ts
 * const handler = createAuthRequestHandler(authConfig)
 * const response = await handler(roboRequest)
 * ```
 */
export function createAuthRequestHandler(config: AuthConfig): AuthRequestHandler {
	return async function authRequestHandler(request: RoboRequest): Promise<Response> {
		try {
			authLogger.debug('Handling auth request', { method: request.method, url: request.url })
			return await Auth(request, config)
		} catch (err: unknown) {
			authLogger.warn('Error in Auth.js request handler', { error: getString(err, 'message'), stack: getString(err, 'stack') })
			const rawCode = extractErrorCode(err)
			const normalizedCode = typeof rawCode === 'string' ? rawCode.toLowerCase() : undefined
			const isCredsError =
				normalizedCode === 'credentials' ||
				normalizedCode === 'credentialssignin' ||
				getString(err, 'type') === 'CredentialsSignin' ||
				getString(err, 'name') === 'CredentialsSignin'
			if (isCredsError) {
				const wantsJson = request.headers.get('accept')?.includes('application/json')
				const codeParam = typeof rawCode === 'string' && rawCode ? rawCode : 'credentials'

				if (wantsJson) {
					return new Response(JSON.stringify({ error: 'CredentialsSignin', code: codeParam }), {
						status: 401,
						headers: { 'content-type': 'application/json' }
					})
				}

				const baseUrl = process.env.AUTH_URL ?? 'http://localhost:3000'
				const signInPath = (config.pages && config.pages.signIn) || '/signin'
				const url = new URL(signInPath, baseUrl)
				url.searchParams.set('error', 'CredentialsSignin')
				url.searchParams.set('code', codeParam)
				return Response.redirect(url.toString(), 302)
			}

			throw err
		}
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getString(obj: unknown, key: string): string | undefined {
  if (!isObject(obj)) return undefined
  const val = obj[key]
  return typeof val === 'string' ? val : undefined
}

function getObject(obj: unknown, key: string): Record<string, unknown> | undefined {
  if (!isObject(obj)) return undefined
  const val = obj[key]
  return isObject(val) ? val : undefined
}

function extractErrorCode(err: unknown): string | undefined {
  const direct = getString(err, 'code') ?? getString(err, 'name')
  if (direct) return direct
  const cause = getObject(err, 'cause')
  if (cause) {
    const fromCause = getString(cause, 'code') ?? getString(cause, 'name')
    if (fromCause) return fromCause
    const nested = getObject(cause, 'err')
    const fromNested = getString(nested, 'code') ?? getString(nested, 'name') ?? getString(nested, 'message')
    if (fromNested) return fromNested
  }
  return getString(err, 'message')
}
