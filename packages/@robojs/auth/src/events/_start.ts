import { randomBytes } from 'node:crypto'
import { getPluginOptions } from 'robo.js'
import { Server } from '@robojs/server'
import { createFlashcoreAdapter } from '../adapters/flashcore.js'
import { normalizeAuthOptions, type NormalizedAuthPluginOptions } from '../config/defaults.js'
import { createAuthRequestHandler } from '../runtime/handler.js'
import { AUTH_ROUTES } from '../runtime/route-map.js'
import { configureAuthRuntime, configureAuthProxyRuntime } from '../runtime/server-helpers.js'
import { nanoid } from 'nanoid'
import { authLogger } from '../utils/logger.js'
import { registerEmailPasswordRuntime } from '../builtins/email-password/runtime.js'
import {
	assertPasswordAdapter,
	EmailPasswordProviderMetadata,
	EmailPasswordRouteOverrides
} from '../builtins/email-password/types.js'
import { ensureLeadingSlash, joinPath, stripTrailingSlash } from '../utils/path.js'
import { EmailManager, setEmailManager, notifyEmail } from '../emails/manager.js'
import type { RoboReply, RoboRequest } from '@robojs/server'
import type { Client } from 'discord.js'
import type { AuthConfig } from '@auth/core'
import type { CookiesOptions, LoggerInstance } from '@auth/core/types'
import type { Provider } from '@auth/core/providers'
import type { HttpMethod } from '../runtime/route-map.js'

type MethodMap = Map<string, Set<HttpMethod>>

type ProviderWithEmailPasswordMeta = Provider & {
	__roboEmailPassword?: EmailPasswordProviderMetadata
}

const authLoggerInstance: Partial<LoggerInstance> = {
	debug: (...data) => authLogger.debug(...data),
	error: (...data) => authLogger.error(...data),
	warn: (...data) => authLogger.warn(...data)
}

type FetchLike = (input: string, init?: unknown) => Promise<Response>

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

function resolveProxyFetch(fetcher?: FetchLike): FetchLike {
	if (fetcher) return fetcher
	if (typeof fetch === 'function') {
		return (input: string, init?: unknown) => fetch(input, init as RequestInit)
	}
	throw new Error('Global fetch is not available. Provide an upstream.fetch implementation for proxy mode.')
}

function createProxyUrl(
	localBasePath: string,
	targetBasePath: string,
	targetBaseUrl: string,
	requestUrl: string
): string {
	const url = new URL(requestUrl)
	const suffix = url.pathname.startsWith(localBasePath) ? url.pathname.slice(localBasePath.length) : url.pathname
	const targetPath = joinPath(targetBasePath, suffix)
	const targetUrl = new URL(targetPath, targetBaseUrl)
	if (url.search) {
		targetUrl.search = url.search
	}
	return targetUrl.toString()
}

function shouldIncludeBody(method: string): boolean {
	return method !== 'GET' && method !== 'HEAD'
}

async function forwardToUpstream(
	request: RoboRequest,
	method: string,
	localBasePath: string,
	targetBasePath: string,
	targetBaseUrl: string,
	fetcher: FetchLike,
	headersOverride?: Record<string, string>
): Promise<Response> {
	const targetUrl = createProxyUrl(localBasePath, targetBasePath, targetBaseUrl, request.url)
	const headers = new Headers(request.headers)
	headers.delete('host')
	headers.delete('content-length')
	headers.delete('connection')
	headers.delete('accept-encoding')
	if (headersOverride) {
		for (const [key, value] of Object.entries(headersOverride)) {
			headers.set(key, value)
		}
	}

	const init: RequestInit = {
		headers,
		method,
		redirect: 'manual',
		signal: request.signal
	}

	if (shouldIncludeBody(method)) {
		const body = await request.arrayBuffer()
		init.body = body
	}

	return fetcher(targetUrl, init)
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

function extractEmailPasswordOverrides(providers: Provider[]): EmailPasswordRouteOverrides | undefined {
	for (const provider of providers) {
		if (!provider || typeof provider !== 'object') continue
		const metadata = (provider as ProviderWithEmailPasswordMeta).__roboEmailPassword
		if (metadata) {
			return metadata.routes
		}
	}
	return undefined
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

	const basePath = stripTrailingSlash(ensureLeadingSlash(options.basePath ?? '/api/auth'))

	if (options.upstream) {
		const upstreamBasePath = stripTrailingSlash(
			ensureLeadingSlash(options.upstream.basePath ?? options.basePath ?? '/api/auth')
		)
		const fetcher = resolveProxyFetch(options.upstream.fetch as FetchLike | undefined)
		const methods = collectMethods(basePath)

		for (const [path, allowedMethods] of methods.entries()) {
			Server.get()?.registerRoute(path, async (request: RoboRequest, reply: RoboReply) => {
				const method = (request.method?.toUpperCase() ?? 'GET') as HttpMethod | 'HEAD'
				if (method === 'HEAD' && allowedMethods.has('GET')) {
					const response = await forwardToUpstream(
						request,
						'HEAD',
						basePath,
						upstreamBasePath,
						options.upstream!.baseUrl,
						fetcher,
						options.upstream!.headers
					)
					authLogger.debug('Proxied Auth.js request (HEAD).', {
						path,
						target: options.upstream!.baseUrl
					})
					return response
				}

				if (!allowedMethods.has(method as HttpMethod)) {
					authLogger.warn('Rejected Auth.js proxy request with disallowed method.', {
						method,
						path,
						allowed: Array.from(allowedMethods)
					})
					reply.code(405).header('Allow', Array.from(allowedMethods).join(', '))
					return reply.send(new Response(null, { status: 405 }))
				}

				const response = await forwardToUpstream(
					request,
					method,
					basePath,
					upstreamBasePath,
					options.upstream!.baseUrl,
					fetcher,
					options.upstream!.headers
				)
				authLogger.debug('Proxied Auth.js request.', {
					method,
					path,
					target: options.upstream!.baseUrl,
					status: response.status
				})
				return response
			})
		}

		configureAuthProxyRuntime({
			localBasePath: basePath,
			targetBasePath: upstreamBasePath,
			baseUrl: options.upstream.baseUrl,
			cookieName:
				options.upstream.cookieName ?? options.cookies.sessionToken?.name ?? 'authjs.session-token',
			secret: options.upstream.secret ?? options.secret,
			sessionStrategy: options.upstream.sessionStrategy,
			headers: options.upstream.headers,
			fetch: fetcher
		})

		authLogger.ready(`@robojs/auth proxying ${basePath} -> ${options.upstream.baseUrl}${upstreamBasePath}`)
		return
	}

	const secret = resolveSecret(options)
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
					appName: options.appName,
					user: {
						id: String((message as { user?: { id?: string } })?.user?.id ?? ''),
						email: message.user.email ?? null,
						name: message.user.name ?? null
					},
					tokens: { verifyEmail: verifyToken },
					links: { verifyEmail: verifyUrl },
					request: { origin: baseUrl }
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
			const providerId = (message.account as { provider?: string } | undefined)?.provider ?? null
			if (isNewUser || (uid && recentNewUsers.has(uid)) || (uid && recentSigninNotified.has(uid))) {
				recentNewUsers.delete(uid)
				recentSigninNotified.delete(uid)
				return
			}

			// Credentials logins are handled by the email-password runtime to enrich context.
			if (providerId !== 'credentials') {
				try {
					await notifyEmail('session:created', {
						appName: options.appName,
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
		pages: options.pages ?? {},
		providers,
		redirectProxyUrl: redirectProxyUrl ?? undefined,
		secret,
		session: options.session,
		trustHost: true,
		debug: options.debug,
		logger: authLoggerInstance
	}

	const handler = createAuthRequestHandler(authConfig)

	const emailPasswordOverrides = extractEmailPasswordOverrides(providers)

	const hasCredentialsProvider = providers.some((provider) => {
		return typeof provider === 'object' && provider && (provider as { id?: string }).id === 'credentials'
	})

	if (hasCredentialsProvider) {
		assertPasswordAdapter(adapter)
		registerEmailPasswordRuntime({
			adapter,
			authConfig,
			basePath,
			baseUrl,
			cookies,
			events: composedEvents,
			handler,
			options,
			overrides: emailPasswordOverrides,
			recentSigninNotified,
			secret,
			sessionStrategy: options.session.strategy ?? 'jwt'
		})
	}

	const methods = collectMethods(basePath)

	for (const [path, allowedMethods] of methods.entries()) {
		Server.get()?.registerRoute(path, async (request: RoboRequest, reply: RoboReply) => {
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
