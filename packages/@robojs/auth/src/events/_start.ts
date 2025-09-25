import { randomBytes } from 'node:crypto'
import { getPluginOptions } from 'robo.js'
import { Server } from '@robojs/server'
import { createFlashcoreAdapter } from '../adapters/flashcore.js'
import { normalizeAuthOptions, type NormalizedAuthPluginOptions } from '../config/defaults.js'
import { createAuthRequestHandler } from '../runtime/handler.js'
import { AUTH_ROUTES } from '../runtime/route-map.js'
import { configureAuthRuntime } from '../runtime/server-helpers.js'
import { createSignupHandler } from '../runtime/signup.js'
import { nanoid } from 'nanoid'
import { authLogger } from '../utils/logger.js'
import { findUserIdByEmail } from '../builtins/email-password/store.js'
import { attachDbSessionCookie, isSuccessRedirect } from '../runtime/session-helpers.js'
import { EmailManager, setEmailManager, notifyEmail } from '../emails/manager.js'
import type { RoboReply, RoboRequest } from '@robojs/server'
import type { Client } from 'discord.js'
import type { AuthConfig } from '@auth/core'
import type { CookiesOptions, LoggerInstance } from '@auth/core/types'
import type { Provider } from '@auth/core/providers'
import type { HttpMethod } from '../runtime/route-map.js'

type MethodMap = Map<string, Set<HttpMethod>>

const authLoggerInstance: Partial<LoggerInstance> = {
	debug: (...data) => authLogger.debug(...data),
	error: (...data) => authLogger.error(...data),
	warn: (...data) => authLogger.warn(...data)
}

function ensureLeadingSlash(path: string): string {
	if (!path.startsWith('/')) {
		return '/' + path
	}
	return path
}

function stripTrailingSlash(path: string): string {
	if (path.length > 1 && path.endsWith('/')) {
		return path.slice(0, -1)
	}
	return path
}

function joinPath(base: string, suffix: string): string {
	const normalizedBase = stripTrailingSlash(ensureLeadingSlash(base))
	const normalizedSuffix = ensureLeadingSlash(suffix)
	return normalizedBase === '/' ? normalizedSuffix : normalizedBase + normalizedSuffix
}

function adjustCookieSecurity(cookies: CookiesOptions, baseUrl: string): CookiesOptions {
	const isSecure = baseUrl.startsWith('https://')
	if (isSecure) return cookies

	return Object.fromEntries(
		Object.entries(cookies).map(([key, value]) => {
			if (!value) return [key, value]
			return [
				key,
				{
					...value,
					options: {
						...value.options,
						secure: false
					}
				}
			]
		})
	) as CookiesOptions
}

function collectMethods(basePath: string): MethodMap {
	const map: MethodMap = new Map()

	for (const route of AUTH_ROUTES) {
		const fullPath = joinPath(basePath, route.path)
		if (!map.has(fullPath)) {
			map.set(fullPath, new Set<HttpMethod>())
		}
		map.get(fullPath)!.add(route.method)
	}

	return map
}

function resolveSecret(options: NormalizedAuthPluginOptions): string {
	const fromOptions = options.secret
	const fromEnv = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
	let secret = fromOptions ?? fromEnv

	if (!secret) {
		secret = randomBytes(32).toString('hex')
		const message =
			'Generated a temporary AUTH_SECRET. Set AUTH_SECRET in your environment or plugin config for persistent sessions.'
		if (process.env.NODE_ENV === 'production') {
			authLogger.error(message)
		} else {
			authLogger.warn(message)
		}
	}

	process.env.AUTH_SECRET = secret
	return secret
}

function resolveBaseUrl(options: NormalizedAuthPluginOptions): string {
	const explicit = options.url ?? process.env.AUTH_URL ?? process.env.NEXTAUTH_URL
	if (explicit) {
		process.env.AUTH_URL = explicit
		return explicit
	}

	const fallback = 'http://localhost:3000'
	if (process.env.NODE_ENV === 'production') {
		authLogger.warn(
			`Using fallback AUTH_URL (${fallback}). Configure auth.url in your plugin config or set AUTH_URL in your environment.`
		)
	}
	process.env.AUTH_URL = fallback
	return fallback
}

export default async function startAuth(_client: Client, runtimeOptions?: unknown) {
	const rawOptions = runtimeOptions ?? getPluginOptions('@robojs/auth') ?? {}
	const options = normalizeAuthOptions(rawOptions)
	await Server.ready()

	const secret = resolveSecret(options)
	const basePath = stripTrailingSlash(ensureLeadingSlash(options.basePath ?? '/api/auth'))
	const baseUrl = resolveBaseUrl(options)
	const redirectProxyUrl = options.redirectProxyUrl ?? process.env.AUTH_REDIRECT_PROXY_URL
	if (redirectProxyUrl) {
		process.env.AUTH_REDIRECT_PROXY_URL = redirectProxyUrl
	}

	authLogger.debug('Initializing @robojs/auth runtime.', {
		basePath,
		baseUrl,
		sessionStrategy: options.session.strategy,
		providers: options.providers.map((provider) => {
			if (typeof provider === 'object' && provider) {
				const record = provider as { id?: string }
				return record.id ?? 'anonymous'
			}
			return 'factory'
		})
	})

	const providers: Provider[] = [...options.providers]
	if (options.allowDangerousEmailAccountLinking) {
		providers.forEach((provider) => {
			if (typeof provider === 'object' && provider) {
				;(provider as { allowDangerousEmailAccountLinking?: boolean }).allowDangerousEmailAccountLinking = true
			}
		})
	}

	const adapter = options.adapter ?? createFlashcoreAdapter({ secret })
	const cookies = adjustCookieSecurity(options.cookies, baseUrl)

	// Compose Auth.js events so we can trigger optional emails without stealing user hooks
	const recentNewUsers = new Set<string>()
	const recentSigninNotified = new Set<string>()
	const userEvents = options.events ?? {}
	const composedEvents: AuthConfig['events'] = {
		...userEvents,
		async createUser(message) {
			await userEvents?.createUser?.(message)

			try {
				// Create verification token and link
				const identifier = message.user.email ?? undefined
				let verifyToken: string | undefined
				let verifyUrl: string | undefined
				if (identifier && adapter.createVerificationToken) {
					const token = nanoid(32)
					const expires = new Date(Date.now() + (options.email?.expiresInMinutes ?? 60) * 60 * 1000)
					await adapter.createVerificationToken({ identifier, token, expires })
					verifyToken = token
					const url = new URL(joinPath(basePath, '/verify-email/confirm'), baseUrl)
					url.searchParams.set('token', token)
					url.searchParams.set('identifier', identifier)
					verifyUrl = url.toString()
				}

				await notifyEmail('user:created', {
					user: {
						id: String((message as { user?: { id?: string } })?.user?.id ?? ''),
						email: message.user.email ?? null,
						name: message.user.name ?? null
					},
					tokens: { verifyEmail: verifyToken },
					links: { verifyEmail: verifyUrl },
					request: { origin: baseUrl }
				})
				// Secondary event for dedicated verification emails (no default template)
				try {
					await notifyEmail('email:verification-requested', {
						user: {
							id: String((message as { user?: { id?: string } })?.user?.id ?? ''),
							email: message.user.email ?? null,
							name: message.user.name ?? null
						},
						tokens: { verifyEmail: verifyToken },
						links: { verifyEmail: verifyUrl },
						request: { origin: baseUrl }
					})
				} catch (e) {
					authLogger.warn('Failed to send email verification request email', e)
				}
				const uid = String((message as { user?: { id?: string } })?.user?.id ?? '')
				if (uid) recentNewUsers.add(uid)
			} catch (e) {
				authLogger.warn('Failed to send user creation email', e)
			}
		},
		async signIn(message) {
			await userEvents?.signIn?.(message)

			// Only emit login alert for existing users; skip new users
			const isNewUser = (message as { isNewUser?: boolean }).isNewUser
			const uid = String(message.user?.id ?? message.account?.providerAccountId ?? '')
			if (isNewUser || (uid && recentNewUsers.has(uid)) || (uid && recentSigninNotified.has(uid))) {
				recentNewUsers.delete(uid)
				recentSigninNotified.delete(uid)
				return
			}
			try {
				await notifyEmail('session:created', {
					user: {
						id: uid,
						email: message.user?.email ?? null,
						name: message.user?.name ?? null
					}
				})
			} catch (e) {
				authLogger.warn('Failed to send new sign-in email', e)
			}
		}
	}

	// Initialize EmailManager only if a mailer is provided
	const emailOptions = options.emails
	if (emailOptions?.mailer) {
		authLogger.debug('Initializing emails with custom mailer')
		const mgr = new EmailManager(emailOptions as ConstructorParameters<typeof EmailManager>[0])
		await mgr.init()
		setEmailManager(mgr)
	} else {
		authLogger.debug('No custom mailer configured; auth emails disabled')
	}

	const userCallbacks = options.callbacks ?? {}
	const composedCallbacks: AuthConfig['callbacks'] = {
		...userCallbacks,
		async session(params) {
			const { session, token, user } = params ?? {}
			const working = session

			try {
				const uid = (user as { id?: string } | undefined)?.id ?? (token as { sub?: string } | undefined)?.sub
				if (uid && adapter.getUser) {
					const dbUser = await adapter.getUser(uid)
					if (dbUser && working?.user) {
						working.user.emailVerified = dbUser.emailVerified ?? null
					}
				}
			} catch (e) {
				authLogger.warn('Failed to enhance session callback with email verification status', e)
			}
			return userCallbacks?.session ? userCallbacks.session({ ...params, session: working }) : working
		}
	}

	const authConfig: AuthConfig = {
		adapter,
		basePath,
		callbacks: composedCallbacks,
		cookies,
		events: composedEvents,
		pages: options.pages,
		providers,
		redirectProxyUrl: redirectProxyUrl ?? undefined,
		secret,
		session: options.session,
		trustHost: true,
		debug: options.debug,
		logger: authLoggerInstance
	}

	const handler = createAuthRequestHandler(authConfig)
	const signupHandler = createSignupHandler({
		authConfig,
		adapter,
		basePath,
		baseUrl,
		cookies,
		defaultRedirectPath: options.pages?.newUser ?? '/dashboard',
		secret,
		sessionStrategy: options.session.strategy ?? 'jwt',
		events: composedEvents
	})

	const signupPath = joinPath(basePath, '/signup')
	Server.registerRoute(signupPath, async (request: RoboRequest) => {
		const method = request.method?.toUpperCase() ?? 'GET'
		if (method === 'OPTIONS') {
			return new Response(null, {
				headers: {
					Allow: 'POST, OPTIONS'
				},
				status: 204
			})
		}

		if (method !== 'POST') {
			authLogger.warn('Rejected credentials signup with disallowed method.', {
				method,
				path: signupPath
			})
			return new Response(null, {
				headers: { Allow: 'POST, OPTIONS' },
				status: 405
			})
		}

		const response = await signupHandler(request)
		authLogger.debug('Handled credentials signup request.', {
			method,
			path: signupPath,
			status: response.status
		})
		return response
	})
	const methods = collectMethods(basePath)

	// Detect presence of Credentials provider to minimize overhead
	const hasCredentialsProvider = providers.some((p) => {
		return typeof p === 'object' && p && (p as { id?: string }).id === 'credentials'
	})

	// Email verification endpoints (only when Credentials provider is in use)
	if (hasCredentialsProvider) {
		const verifyConfirmPath = joinPath(basePath, '/verify-email/confirm')
		Server.registerRoute(verifyConfirmPath, async (request: RoboRequest) => {
			const url = new URL(request.url)
			const token = url.searchParams.get('token') ?? undefined
			const identifier = url.searchParams.get('identifier') ?? undefined
			if (!token || !identifier) {
				const fallbackPath = options.pages?.verifyRequest ?? '/verify-email'
				return Response.redirect(new URL(fallbackPath + '?error=MissingParams', baseUrl).toString(), 303)
			}
			try {
				const used = await adapter.useVerificationToken?.({ identifier, token })
				if (!used) {
					const fallbackPath = options.pages?.verifyRequest ?? '/verify-email'
					return Response.redirect(new URL(fallbackPath + '?error=InvalidOrExpired', baseUrl).toString(), 303)
				}
				const user = await adapter.getUserByEmail?.(identifier)
				if (!user) {
					const fallbackPath = options.pages?.verifyRequest ?? '/verify-email'
					return Response.redirect(new URL(fallbackPath + '?error=UserNotFound', baseUrl).toString(), 303)
				}
				await adapter.updateUser?.({ ...user, emailVerified: new Date() })
				try {
					await notifyEmail('email:verified', {
						user: { id: user.id, email: user.email ?? null, name: user.name ?? null },
						request: { origin: baseUrl }
					})
				} catch (e) {
					authLogger.warn('Failed to send email verified confirmation email', e)
				}

				const fallbackPath = options.pages?.verifyRequest ?? '/verify-email'
				return Response.redirect(new URL(fallbackPath + '?status=ok', baseUrl).toString(), 303)
			} catch (e) {
				authLogger.warn('Email verification failed', { error: (e as Error)?.message })
				const fallbackPath = options.pages?.verifyRequest ?? '/verify-email'
				return Response.redirect(new URL(fallbackPath + '?error=ServerError', baseUrl).toString(), 303)
			}
		})

		// Email verification: default built-in page (simple HTML)
		const verifyPagePath = joinPath(basePath, '/verify-email')
		Server.registerRoute(verifyPagePath, async (request: RoboRequest) => {
			const url = new URL(request.url)
			const status = url.searchParams.get('status')
			const error = url.searchParams.get('error')
			const wantsJson = request.headers.get('accept')?.includes('application/json')
			if (wantsJson) {
				return new Response(JSON.stringify({ status: status ?? (error ? 'error' : 'pending'), error }), {
					headers: { 'content-type': 'application/json' },
					status: 200
				})
			}
			const title = status === 'ok' ? 'Email Confirmed' : error ? 'Verification Failed' : 'Verify Your Email'
			const body =
				status === 'ok'
					? '<p>Your email has been confirmed. You can close this window.</p>'
					: error
						? `<p>We could not confirm your email. (${error})</p>`
						: '<p>Follow the link we sent to your email to confirm your account.</p>'
			const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>${title}</title><style>body{font-family:Inter,ui-sans-serif,system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:32px;background:#0b0d12;color:#e5e7eb} .card{max-width:560px;margin:0 auto;background:#131722;border-radius:12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,.3)} h1{margin:0 0 12px;font-size:22px}</style></head><body><div class="card"><h1>${title}</h1>${body}</div></body></html>`
			return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
		})

		// Resend verification email on demand (by email)
		const verifyRequestPath = joinPath(basePath, '/verify-email/request')
		Server.registerRoute(verifyRequestPath, async (request: RoboRequest) => {
			const method = request.method?.toUpperCase() ?? 'GET'
			if (method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
			try {
				let email: string | null = null
				const contentType = request.headers.get('content-type') ?? ''
				if (contentType.includes('application/json')) {
					const body = (await request.json()) as Record<string, unknown>
					const raw = body['email']
					if (typeof raw === 'string') email = raw.toLowerCase()
				} else {
					const form = await request.formData()
					const raw = form.get('email')
					if (typeof raw === 'string') email = raw.toLowerCase()
				}
				if (email) {
					const user = await adapter.getUserByEmail?.(email)
					if (user) {
						const token = nanoid(32)
						const expires = new Date(Date.now() + (options.email?.expiresInMinutes ?? 60) * 60 * 1000)
						await adapter.createVerificationToken?.({ identifier: email, token, expires })
						const url = new URL(joinPath(basePath, '/verify-email/confirm'), baseUrl)
						url.searchParams.set('token', token)
						url.searchParams.set('identifier', email)
						try {
							await notifyEmail('email:verification-requested', {
								user: { id: user.id, email: user.email ?? null, name: user.name ?? null },
								links: { verifyEmail: url.toString() },
								request: { origin: baseUrl }
							})
						} catch (e) {
							authLogger.warn('Failed to send email verification request email', e)
						}
					}
				}
				return new Response(null, { status: 204 })
			} catch {
				return new Response(null, { status: 204 })
			}
		})

		// Password reset endpoints
		const resetRequestPath = joinPath(basePath, '/password/reset/request')
		Server.registerRoute(resetRequestPath, async (request: RoboRequest) => {
			const method = request.method?.toUpperCase() ?? 'GET'
			if (method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
			try {
				let email: string | null = null
				const contentType = request.headers.get('content-type') ?? ''
				if (contentType.includes('application/json')) {
					const body = (await request.json()) as Record<string, unknown>
					const raw = body['email']
					if (typeof raw === 'string') email = raw.toLowerCase()
				} else {
					const form = await request.formData()
					const raw = form.get('email')
					if (typeof raw === 'string') email = raw.toLowerCase()
				}
				if (email) {
					const user = await adapter.getUserByEmail?.(email)
					if (user) {
						const token = nanoid(32)
						const expires = new Date(Date.now() + (options.email?.expiresInMinutes ?? 60) * 60 * 1000)
						await adapter.createVerificationToken?.({ identifier: email, token, expires })
						const url = new URL(joinPath(basePath, '/password/reset/confirm'), baseUrl)
						url.searchParams.set('token', token)
						url.searchParams.set('identifier', email)
						try {
							await notifyEmail('password:reset-requested', {
								user: { id: user.id, email: user.email ?? null, name: user.name ?? null },
								links: { resetPassword: url.toString() },
								request: { origin: baseUrl }
							})
						} catch (e) {
							authLogger.warn('Failed to send password reset request email', e)
						}
					}
				}
				return new Response(null, { status: 204 })
			} catch {
				return new Response(null, { status: 204 })
			}
		})

		const resetConfirmPath = joinPath(basePath, '/password/reset/confirm')
		Server.registerRoute(resetConfirmPath, async (request: RoboRequest) => {
			const method = request.method?.toUpperCase() ?? 'GET'
			if (method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
			try {
				const contentType = request.headers.get('content-type') ?? ''
				let token: string | undefined
				let identifier: string | undefined
				let newPassword: string | undefined
				if (contentType.includes('application/json')) {
					const body = (await request.json()) as Record<string, unknown>
					token = typeof body['token'] === 'string' ? (body['token'] as string) : undefined
					identifier = typeof body['identifier'] === 'string' ? (body['identifier'] as string).toLowerCase() : undefined
					newPassword = typeof body['password'] === 'string' ? (body['password'] as string) : undefined
				} else {
					const form = await request.formData()
					token = typeof form.get('token') === 'string' ? (form.get('token') as string) : undefined
					identifier =
						typeof form.get('identifier') === 'string' ? (form.get('identifier') as string).toLowerCase() : undefined
					newPassword = typeof form.get('password') === 'string' ? (form.get('password') as string) : undefined
				}
				if (!token || !identifier || !newPassword) return new Response(null, { status: 400 })
				const used = await adapter.useVerificationToken?.({ identifier, token })
				if (!used) return new Response(null, { status: 400 })
				const user = await adapter.getUserByEmail?.(identifier)
				if (!user) return new Response(null, { status: 400 })
				try {
					const { resetPassword, findUserIdByEmail } = await import('../builtins/email-password/store.js')
					const uid = await findUserIdByEmail(identifier)
					if (uid) await resetPassword(uid, newPassword)
					await notifyEmail('password:reset-completed', {
						user: { id: user.id, email: user.email ?? null, name: user.name ?? null },
						request: { origin: baseUrl }
					})
				} catch (e) {
					authLogger.warn('Failed to send password reset confirmation email', e)
				}
				return new Response(null, { status: 204 })
			} catch {
				return new Response(null, { status: 400 })
			}
		})
	}

	// Intercept credentials callback to enrich email context and (for DB strategy) create session cookie
	if (hasCredentialsProvider) {
		if ((options.session.strategy ?? 'jwt') === 'database') {
			authLogger.debug('Enabling credentials callback interception for DB session cookie issuance.')
		}
		const credentialsCallbackPath = joinPath(basePath, '/callback/credentials')
		Server.registerRoute(credentialsCallbackPath, async (request: RoboRequest, reply: RoboReply) => {
			const method = request.method?.toUpperCase() ?? 'GET'

			// Delegate non-POST to default handler
			if (method !== 'POST') {
				return handler(request, reply)
			}

			// Capture email from request before passing to Auth()
			let emailFromBody: string | null = null
			try {
				const clone = request.clone?.() ?? request
				const form = await clone.formData()
				const rawEmail = form.get('email')
				if (typeof rawEmail === 'string') emailFromBody = rawEmail.toLowerCase()
			} catch (e) {
				authLogger.warn('Failed to parse email from credentials sign-in request', e)
			}

			const response = await handler(request, reply)

			// Determine if sign-in succeeded (redirect without error)
			if (!isSuccessRedirect(response)) {
				return response
			}

			// Resolve user id via email mapping
			const userId = emailFromBody ? await findUserIdByEmail(emailFromBody) : null
			if (userId) {
				// Fire sign-in email with request metadata (IP/UA)
				const ip =
					request.headers.get('cf-connecting-ip') ??
					(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
						request.headers.get('x-real-ip') ||
						undefined)
				const userAgent = request.headers.get('user-agent') ?? undefined
				try {
					await notifyEmail('session:created', {
						user: { id: userId, email: emailFromBody ?? undefined, name: emailFromBody?.split('@')[0] },
						session: { ip: ip ?? null, userAgent: userAgent ?? null }
					})
					recentSigninNotified.add(userId)
				} catch (e) {
					authLogger.warn('Failed to send sign-in email', e)
				}
			}

			if ((options.session.strategy ?? 'jwt') === 'database' && userId) {
				try {
					return await attachDbSessionCookie({
						response,
						adapter,
						cookies,
						config: authConfig,
						userId
					})
				} catch (e) {
					authLogger.warn('Failed to create DB session for credentials login', { error: (e as Error)?.message })
					return response
				}
			}
			return response
		})
	}

	for (const [path, allowedMethods] of methods.entries()) {
		Server.registerRoute(path, async (request: RoboRequest, reply: RoboReply) => {
			const method = request.method?.toUpperCase() ?? 'GET'
			if (method === 'HEAD' && allowedMethods.has('GET')) {
				const response = await handler(request, reply)
				authLogger.debug('Handled Auth.js request.', {
					method,
					path,
					status: response.status
				})
				return response
			}

			if (!allowedMethods.has(method as HttpMethod)) {
				authLogger.warn('Rejected Auth.js request with disallowed method.', {
					method,
					path,
					allowed: Array.from(allowedMethods)
				})
				reply.code(405).header('Allow', Array.from(allowedMethods).join(', '))
				return reply.send(new Response(null, { status: 405 }))
			}

			const response = await handler(request, reply)
			authLogger.debug('Handled Auth.js request.', {
				method,
				path,
				status: response.status
			})
			return response
		})
	}

	const cookieName = cookies.sessionToken?.name ?? 'authjs.session-token'

	configureAuthRuntime(authConfig, {
		basePath,
		baseUrl,
		cookieName,
		secret,
		sessionStrategy: options.session.strategy ?? 'jwt'
	})

	authLogger.ready(`@robojs/auth mounted on ${basePath}`)
}
