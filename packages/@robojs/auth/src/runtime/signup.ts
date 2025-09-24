import { createHash } from 'node:crypto'
import { Auth } from '@auth/core'
import type { AuthConfig } from '@auth/core'
import type { Adapter, AdapterUser } from '@auth/core/adapters'
import type { CookiesOptions } from '@auth/core/types'
import { attachDbSessionCookie, isSuccessRedirect } from './session-helpers.js'
import type { RoboRequest } from '@robojs/server'
import { nanoid } from 'nanoid'
import { findUserIdByEmail, removePassword, storePassword } from '../credentials/password.js'
import { authLogger } from '../utils/logger.js'

interface SignupHandlerOptions {
	authConfig: AuthConfig
	adapter: Adapter
	basePath: string
	baseUrl: string
	cookies: CookiesOptions
	defaultRedirectPath?: string
	secret: string
	events?: AuthConfig['events']
	sessionStrategy?: 'jwt' | 'database'
}

interface SignupPayload {
	email: string
	password: string
	passwordConfirm?: string
	csrfToken: string
	callbackUrl?: string
	termsAccepted: boolean
}

const EMAIL_REGEX = /^(?:[^\s@]+)@(?:[^\s@.]+\.)+[^\s@.]{2,}$/i
const DEFAULT_REDIRECT_PATH = '/dashboard'

class SignupError extends Error {
	public readonly code: string
	public readonly status: number

	constructor(code: string, message: string, status = 400) {
		super(message)
		this.code = code
		this.status = status
	}
}

function wantsJson(request: RoboRequest): boolean {
	const accept = request.headers.get('accept') ?? ''
	if (accept.includes('application/json')) return true
	const contentType = request.headers.get('content-type') ?? ''
	return contentType.includes('application/json')
}

function parseCookieHeader(header: string | null): Record<string, string> {
	if (!header) return {}
	const pairs = header.split(';')
	const map: Record<string, string> = {}
	for (const pair of pairs) {
		const [rawKey, rawValue] = pair.split('=')
		const key = rawKey?.trim()
		if (!key) continue
		map[key] = decodeURIComponent((rawValue ?? '').trim())
	}
	return map
}

function normalizeBoolean(value: unknown): boolean {
	if (typeof value === 'boolean') return value
	if (typeof value === 'number') return value !== 0
	if (typeof value === 'string') {
		return ['true', '1', 'on', 'yes'].includes(value.trim().toLowerCase())
	}
	return false
}

async function parsePayload(request: RoboRequest): Promise<SignupPayload> {
	const contentType = request.headers.get('content-type') ?? ''

	if (contentType.includes('application/json')) {
		const body = (await request.json()) as Record<string, unknown>
		return normalizePayload(body)
	}

	const form = await request.formData()
	const body: Record<string, unknown> = {}
	form.forEach((value, key) => {
		body[key] = value as unknown
	})

	return normalizePayload(body)
}

function normalizePayload(body: Record<string, unknown>): SignupPayload {
	const findString = (...keys: string[]): string | undefined => {
		for (const key of keys) {
			const value = body[key]
			if (typeof value === 'string') {
				const trimmed = value.trim()
				if (trimmed) return trimmed
			}
		}
		return undefined
	}

	const email = findString('email', 'username') ?? ''
	const password = findString('password', 'pass') ?? ''
	const passwordConfirm = findString('passwordConfirm', 'confirmPassword', 'password_confirmation')
	const csrfToken = findString('csrfToken', 'csrf') ?? ''
	const callbackUrl = findString('callbackUrl', 'callback')
	const termsValue = body.terms ?? body.acceptTerms ?? body.termsAccepted

	return {
		email,
		password,
		passwordConfirm,
		csrfToken,
		callbackUrl,
		termsAccepted: normalizeBoolean(termsValue)
	}
}

function ensureEmailValid(email: string) {
	if (!email) {
		throw new SignupError('InvalidEmail', 'Email is required.')
	}
	if (!EMAIL_REGEX.test(email)) {
		throw new SignupError('InvalidEmail', 'Email format is invalid.')
	}
}

function ensurePasswordValid(password: string, confirm?: string) {
	if (!password) {
		throw new SignupError('InvalidPassword', 'Password is required.')
	}
	if (password.length < 8) {
		throw new SignupError('InvalidPassword', 'Password must be at least 8 characters long.')
	}
	if (confirm && password !== confirm) {
		throw new SignupError('PasswordMismatch', 'Passwords do not match.')
	}
}

function ensureTermsAccepted(accepted: boolean) {
	if (!accepted) {
		throw new SignupError('TermsRequired', 'You must accept the terms to create an account.')
	}
}

function validateCsrfToken(payloadToken: string, cookieHeader: string | null, cookies: CookiesOptions, secret: string) {
	if (!payloadToken) {
		throw new SignupError('MissingCsrf', 'Missing CSRF token.')
	}

	const cookieName = cookies.csrfToken?.name ?? 'authjs.csrf-token'
	const cookieValue = parseCookieHeader(cookieHeader)[cookieName]
	if (!cookieValue) {
		throw new SignupError('MissingCsrf', 'Missing CSRF cookie.')
	}

	const [cookieToken, cookieHash] = cookieValue.split('|')
	if (!cookieToken || !cookieHash) {
		throw new SignupError('InvalidCsrf', 'Malformed CSRF cookie.')
	}

	const expectedHash = createHash('sha256').update(`${cookieToken}${secret}`).digest('hex')
	if (expectedHash !== cookieHash || cookieToken !== payloadToken) {
		throw new SignupError('InvalidCsrf', 'CSRF token validation failed.')
	}
}

function resolveDefaultRedirect(baseUrl: string, redirectPath?: string | null): string {
	const target = redirectPath && redirectPath.trim().length > 0 ? redirectPath : DEFAULT_REDIRECT_PATH
	try {
		return new URL(target, baseUrl).toString()
	} catch (error) {
		authLogger.debug('Invalid callbackUrl provided, falling back to default redirect.', { target, error })
		return new URL(DEFAULT_REDIRECT_PATH, baseUrl).toString()
	}
}

async function createUserWithPassword(
	adapter: Adapter,
	email: string,
	password: string,
	events?: AuthConfig['events']
): Promise<AdapterUser> {
	if (!adapter.createUser) {
		throw new SignupError('Unsupported', 'The configured adapter does not support user creation.', 500)
	}

	const userId = await findUserIdByEmail(email)
	if (userId) {
		throw new SignupError('EmailTaken', 'An account with this email already exists.')
	}

	const existingUser = adapter.getUserByEmail ? await adapter.getUserByEmail(email) : null
	if (existingUser) {
		throw new SignupError('EmailTaken', 'An account with this email already exists.')
	}

	const baseUser: AdapterUser = {
		email,
		emailVerified: null,
		id: nanoid(21),
		name: email.split('@')[0] ?? email
	}

	let created: AdapterUser | null = null
	try {
		created = await adapter.createUser(baseUser)
		await storePassword(created.id, email, password)
		await events?.createUser?.({ user: created })
		authLogger.info('Created new credentials user.', { email, userId: created.id })
		return created
	} catch (error) {
		authLogger.error('Failed to create credentials user.', { email, error })
		if (created) {
			try {
				await adapter.deleteUser?.(created.id)
			} catch (cleanupError) {
				authLogger.warn('Failed to rollback user after signup error.', { email, cleanupError })
			}
		}
		throw error
	}
}

async function signInWithCredentials(
	authConfig: AuthConfig,
	basePath: string,
	baseUrl: string,
	callbackUrl: string,
	csrfToken: string,
	email: string,
	password: string,
	request: RoboRequest
): Promise<Response> {
	const normalizedBasePath = basePath.endsWith('/callback/credentials') ? basePath : `${basePath}/callback/credentials`
	const loginUrl = new URL(normalizedBasePath, baseUrl)

	const body = new URLSearchParams()
	body.set('csrfToken', csrfToken)
	body.set('email', email)
	body.set('password', password)
	body.set('callbackUrl', callbackUrl)

	const headers = new Headers()
	headers.set('content-type', 'application/x-www-form-urlencoded')
	const cookie = request.headers.get('cookie')
	if (cookie) headers.set('cookie', cookie)
	const userAgent = request.headers.get('user-agent')
	if (userAgent) headers.set('user-agent', userAgent)
	const forwardedFor = request.headers.get('x-forwarded-for')
	if (forwardedFor) headers.set('x-forwarded-for', forwardedFor)
	const forwardedHost = request.headers.get('x-forwarded-host')
	if (forwardedHost) headers.set('x-forwarded-host', forwardedHost)
	const origin = request.headers.get('origin') ?? new URL(request.url).origin
	headers.set('origin', origin)

	const authRequest = new Request(loginUrl.toString(), {
		method: 'POST',
		headers,
		body
	})

	return Auth(authRequest, authConfig)
}

export function createSignupHandler(options: SignupHandlerOptions) {
	const {
		authConfig,
		adapter,
		basePath,
		baseUrl,
		cookies,
		defaultRedirectPath = DEFAULT_REDIRECT_PATH,
		secret,
		events,
		sessionStrategy = 'jwt'
	} = options

	return async function handleSignup(request: RoboRequest): Promise<Response> {
		const wantsJsonResponse = wantsJson(request)
		let attemptedPayload: SignupPayload | null = null

		try {
			const payload = await parsePayload(request)
			attemptedPayload = payload
			authLogger.debug('Signup attempt:', { email: payload.email })

			ensureEmailValid(payload.email)
			ensurePasswordValid(payload.password, payload.passwordConfirm)
			ensureTermsAccepted(payload.termsAccepted)
			validateCsrfToken(payload.csrfToken, request.headers.get('cookie'), cookies, secret)

			const normalizedEmail = payload.email.toLowerCase()
			const user = await createUserWithPassword(adapter, normalizedEmail, payload.password, events)
			authLogger.debug('User signed up successfully.', { email: normalizedEmail, userId: user.id })

			const callbackUrl = resolveDefaultRedirect(baseUrl, payload.callbackUrl ?? defaultRedirectPath)
			try {
				const response = await signInWithCredentials(
					authConfig,
					basePath,
					baseUrl,
					callbackUrl,
					payload.csrfToken,
					normalizedEmail,
					payload.password,
					request
				)

				// For database strategy, ensure a DB session + cookie exists (parity with OAuth providers)
				if (sessionStrategy === 'database' && isSuccessRedirect(response)) {
					try {
						return await attachDbSessionCookie({
							response,
							adapter,
							cookies,
							config: authConfig,
							userId: user.id
						})
					} catch (e) {
						authLogger.warn('Failed to create DB session after signup credentials login', {
							email: normalizedEmail,
							error: (e as Error)?.message
						})
						return response
					}
				}

				return response
			} catch (signInError) {
				authLogger.error('Auto sign-in after signup failed, rolling back user.', {
					email: normalizedEmail,
					error: (signInError as Error)?.message
				})
				try {
					await removePassword(user.id)
					await adapter.deleteUser?.(user.id)
				} catch (rollbackError) {
					authLogger.warn('Failed to rollback user after sign-in failure.', {
						email: normalizedEmail,
						error: (rollbackError as Error)?.message
					})
				}
				throw signInError
			}
		} catch (error) {
			if (error instanceof SignupError) {
				if (wantsJsonResponse) {
					return new Response(JSON.stringify({ error: error.code, message: error.message }), {
						headers: { 'content-type': 'application/json' },
						status: error.status
					})
				}

				const redirectUrl = new URL('/signup', baseUrl)
				if (attemptedPayload?.callbackUrl) {
					redirectUrl.searchParams.set('callbackUrl', attemptedPayload.callbackUrl)
				}
				redirectUrl.searchParams.set('error', error.code)
				return Response.redirect(redirectUrl.toString(), 303)
			}

			authLogger.error('Unexpected error during credentials signup.', {
				error: (error as Error)?.message ?? 'unknown'
			})

			if (wantsJsonResponse) {
				return new Response(JSON.stringify({ error: 'SignupFailed', message: 'Unable to create account right now.' }), {
					headers: { 'content-type': 'application/json' },
					status: 500
				})
			}

			const redirectUrl = new URL('/signup', baseUrl)
			if (attemptedPayload?.callbackUrl) {
				redirectUrl.searchParams.set('callbackUrl', attemptedPayload.callbackUrl)
			}
			redirectUrl.searchParams.set('error', 'SignupFailed')
			return Response.redirect(redirectUrl.toString(), 303)
		}
	}
}
