import { randomBytes } from 'node:crypto'
import { getPluginOptions } from 'robo.js'
import { Server } from '@robojs/server'
import { createFlashcoreAdapter } from '../adapters/flashcore.js'
import { normalizeAuthOptions, type NormalizedAuthPluginOptions } from '../config/defaults.js'
import { createAuthRequestHandler } from '../runtime/handler.js'
import { AUTH_ROUTES } from '../runtime/route-map.js'
import { configureAuthRuntime } from '../runtime/server-helpers.js'
import { createSignupHandler } from '../runtime/signup.js'
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
	const userEvents = options.events ?? {}
	const composedEvents: AuthConfig['events'] = {
		...userEvents,
		async createUser(message) {
			await userEvents?.createUser?.(message)

			try {
				await notifyEmail('user:created', {
					user: {
						id: String((message as { user?: { id?: string } })?.user?.id ?? ''),
						email: message.user.email ?? null,
						name: message.user.name ?? null
					}
				})
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
			if (isNewUser || (uid && recentNewUsers.has(uid))) {
				recentNewUsers.delete(uid)
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

	const authConfig: AuthConfig = {
		adapter,
		basePath,
		callbacks: options.callbacks,
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

	// Intercept credentials callback (POST) to create DB session + cookie when using database strategy
	if ((options.session.strategy ?? 'jwt') === 'database' && hasCredentialsProvider) {
		authLogger.debug('Enabling credentials callback interception for DB session cookie issuance.')
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
			if (!userId) {
				return response
			}

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
