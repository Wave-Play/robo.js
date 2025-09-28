import { Server, type RoboReply, type RoboRequest } from '@robojs/server'
import { nanoid } from 'nanoid'
import type { AuthConfig } from '@auth/core'
import type { CookiesOptions } from '@auth/core/types'
import { authLogger } from '../../utils/logger.js'
import { joinPath } from '../../utils/path.js'
import { notifyEmail } from '../../emails/manager.js'
import { attachDbSessionCookie, isSuccessRedirect } from '../../runtime/session-helpers.js'
import { createSignupHandler } from './signup.js'
import { getRequestPayload } from '../../utils/request-payload.js'
import type { NormalizedAuthPluginOptions } from '../../config/defaults.js'
import type { EmailPasswordRouteOverrides, PasswordAdapter } from './types.js'

type AuthHandler = (request: RoboRequest, reply: RoboReply) => Promise<Response>

type PasswordResetMessage = { text: string; variant: 'success' | 'error' }

interface EmailPasswordRuntimeOptions {
	adapter: PasswordAdapter
	authConfig: AuthConfig
	basePath: string
	baseUrl: string
	cookies: CookiesOptions
	events?: AuthConfig['events']
	handler: AuthHandler
	options: NormalizedAuthPluginOptions
	overrides?: EmailPasswordRouteOverrides
	recentSigninNotified: Set<string>
	secret: string
	sessionStrategy: 'jwt' | 'database'
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
}

function renderPasswordResetPage(params: {
	actionUrl: string
	token: string | null
	identifier: string | null
	signInUrl: string
	message?: PasswordResetMessage
}): string {
	const { actionUrl, token, identifier, signInUrl, message } = params
	const hasToken = Boolean(token && identifier)
	const title = hasToken ? 'Set a new password' : 'Reset link invalid'
	const bodyCopy = hasToken
		? 'Choose a new password for your account.'
		: 'This reset link is missing required details or may have expired.'
	const safeAction = escapeHtml(actionUrl)
	const safeSignInUrl = escapeHtml(signInUrl)
	const safeToken = token ? escapeHtml(token) : ''
	const safeIdentifier = identifier ? escapeHtml(identifier) : ''
	const banner = message ? `<div class="banner banner--${message.variant}">${escapeHtml(message.text)}</div>` : ''
	const content = hasToken
		? `<form method="POST" action="${safeAction}">
			<input type="hidden" name="token" value="${safeToken}" />
			<input type="hidden" name="identifier" value="${safeIdentifier}" />
			<h1>${title}</h1>
			<p>${bodyCopy}</p>
			<label>New password
				<input type="password" name="password" minlength="8" required autocomplete="new-password" autofocus />
			</label>
			<button type="submit">Save password</button>
			<p class="muted"><a href="${safeSignInUrl}">Back to sign in</a></p>
		</form>`
		: `<div class="card">
			<h1>${title}</h1>
			<p>${bodyCopy}</p>
			<p class="muted"><a href="${safeSignInUrl}">Return to sign in</a></p>
		</div>`
	return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      body { margin:0; padding:32px 16px; background:#0b0d12; color:#e5e7eb; }
      .viewport { max-width:520px; margin:0 auto; }
      form, .card { background:#131722; border-radius:14px; padding:28px; box-shadow:0 2px 8px rgba(0,0,0,0.3); display:flex; flex-direction:column; gap:16px; }
      h1 { margin:0 0 4px; font-size:22px; }
      p { margin:0; line-height:1.6; }
      label { display:flex; flex-direction:column; gap:8px; font-weight:600; }
      input[type='password'] { border-radius:10px; border:1px solid rgba(148,163,184,0.35); padding:12px; font-size:15px; background:rgba(15,23,42,0.75); color:inherit; }
      button { border:none; border-radius:10px; padding:12px 18px; background:#6366f1; color:#fff; font-weight:600; cursor:pointer; }
      button:hover { background:#4f46e5; }
      .muted { color:rgba(148,163,184,0.85); font-size:14px; }
      a { color:#818cf8; }
      .banner { border-radius:12px; padding:14px 18px; margin-bottom:12px; font-weight:600; }
      .banner--success { background:rgba(34,197,94,0.12); color:#4ade80; border:1px solid rgba(34,197,94,0.35); }
      .banner--error { background:rgba(248,113,113,0.12); color:#fca5a5; border:1px solid rgba(248,113,113,0.35); }
    </style>
  </head>
  <body>
    <div class="viewport">
      ${banner}${content}
    </div>
  </body>
</html>`
}

function registerSignupRoute(options: EmailPasswordRuntimeOptions): void {
	const {
		adapter,
		authConfig,
		basePath,
		baseUrl,
		cookies,
		events,
		options: pluginOptions,
		overrides,
		secret,
		sessionStrategy
	} = options

	const signupHandler = createSignupHandler({
		authConfig,
		adapter,
		basePath,
		baseUrl,
		cookies,
		defaultRedirectPath: pluginOptions.pages?.newUser ?? '/dashboard',
		secret,
		sessionStrategy,
		events
	})

	const signupPath = joinPath(basePath, '/signup')
	Server.registerRoute(signupPath, async (request: RoboRequest) => {
		const method = request.method?.toUpperCase() ?? 'GET'
		if (method === 'OPTIONS') {
			return new Response(null, {
				headers: { Allow: 'POST, OPTIONS' },
				status: 204
			})
		}
		if (method !== 'POST') {
			authLogger.warn('Rejected credentials signup with disallowed method.', {
				method,
				path: signupPath
			})
			return new Response(null, { headers: { Allow: 'POST, OPTIONS' }, status: 405 })
		}

		const payload = await getRequestPayload(request)
		const runDefault = () => signupHandler(request)
		const response = overrides?.signup
			? await overrides.signup({
					adapter,
					authConfig,
					basePath,
					baseUrl,
					cookies,
					defaultHandler: runDefault,
					events,
					payload,
					request,
					secret,
					sessionStrategy
				})
			: await runDefault()
		authLogger.debug('Handled credentials signup request.', {
			method,
			path: signupPath,
			status: response.status
		})
		return response
	})
}

function registerVerifyEmailRoutes(options: EmailPasswordRuntimeOptions): void {
	const { adapter, basePath, baseUrl, options: pluginOptions } = options

	const verifyConfirmPath = joinPath(basePath, '/verify-email/confirm')
	Server.registerRoute(verifyConfirmPath, async (request: RoboRequest) => {
		const url = new URL(request.url)
		const token = url.searchParams.get('token') ?? undefined
		const identifier = url.searchParams.get('identifier') ?? undefined
		const fallbackPath = pluginOptions.pages?.verifyRequest ?? '/verify-email'
		if (!token || !identifier) {
			return Response.redirect(new URL(`${fallbackPath}?error=MissingParams`, baseUrl).toString(), 303)
		}
		try {
			const used = await adapter.useVerificationToken?.({ identifier, token })
			if (!used) {
				return Response.redirect(new URL(`${fallbackPath}?error=InvalidOrExpired`, baseUrl).toString(), 303)
			}
			const user = await adapter.getUserByEmail?.(identifier)
			if (!user) {
				return Response.redirect(new URL(`${fallbackPath}?error=UserNotFound`, baseUrl).toString(), 303)
			}
			await adapter.updateUser?.({ ...user, emailVerified: new Date() })
			try {
				await notifyEmail('email:verified', {
					user: { id: user.id, email: user.email ?? null, name: user.name ?? null },
					request: { origin: baseUrl }
				})
			} catch (error) {
				authLogger.warn('Failed to send email verified confirmation email', error)
			}
			return Response.redirect(new URL(`${fallbackPath}?status=ok`, baseUrl).toString(), 303)
		} catch (error) {
			authLogger.warn('Email verification failed', { error: (error as Error)?.message })
			return Response.redirect(new URL(`${fallbackPath}?error=ServerError`, baseUrl).toString(), 303)
		}
	})

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

	const verifyRequestPath = joinPath(basePath, '/verify-email/request')
	Server.registerRoute(verifyRequestPath, async (request: RoboRequest) => {
		const method = request.method?.toUpperCase() ?? 'GET'
		if (method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
		try {
			const payload = await getRequestPayload(request)
			const record = payload.get()
			let email: string | null = null
			const raw = record['email']
			if (typeof raw === 'string') {
				email = raw.toLowerCase()
			} else if (Array.isArray(raw) && typeof raw[0] === 'string') {
				email = raw[0].toLowerCase()
			}
			if (email) {
				payload.assign({ email })
				const user = await adapter.getUserByEmail?.(email)
				if (user) {
					const token = nanoid(32)
					const expires = new Date(Date.now() + (pluginOptions.email?.expiresInMinutes ?? 60) * 60 * 1000)
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
					} catch (error) {
						authLogger.warn('Failed to send email verification request email', error)
					}
				}
			}
			return new Response(null, { status: 204 })
		} catch {
			return new Response(null, { status: 204 })
		}
	})
}

function registerPasswordResetRoutes(options: EmailPasswordRuntimeOptions): void {
	const {
		adapter,
		basePath,
		baseUrl,
		options: pluginOptions,
		overrides,
		authConfig,
		cookies,
		events,
		secret,
		sessionStrategy
	} = options

	const resetRequestPath = joinPath(basePath, '/password/reset/request')
	Server.registerRoute(resetRequestPath, async (request: RoboRequest) => {
		const method = request.method?.toUpperCase() ?? 'GET'
		if (method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
		const payload = await getRequestPayload(request)
		const runDefault = async () => {
			try {
				const record = payload.get()
				let email: string | null = null
				const raw = record['email']
				if (typeof raw === 'string') {
					email = raw.toLowerCase()
				} else if (Array.isArray(raw) && typeof raw[0] === 'string') {
					email = raw[0].toLowerCase()
				}
				if (email) {
					payload.assign({ email })
					const user = await adapter.getUserByEmail?.(email)
					if (user) {
						const token = nanoid(32)
						const expires = new Date(Date.now() + (pluginOptions.email?.expiresInMinutes ?? 60) * 60 * 1000)
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
						} catch (error) {
							authLogger.warn('Failed to send password reset request email', error)
						}
					}
				}
				return new Response(null, { status: 204 })
			} catch {
				return new Response(null, { status: 204 })
			}
		}
		if (overrides?.passwordResetRequest) {
			return overrides.passwordResetRequest({
				adapter,
				authConfig,
				basePath,
				baseUrl,
				cookies,
				defaultHandler: runDefault,
				events,
				payload,
				request,
				secret,
				sessionStrategy
			})
		}
		return runDefault()
	})

	const resetConfirmPath = joinPath(basePath, '/password/reset/confirm')
	Server.registerRoute(resetConfirmPath, async (request: RoboRequest) => {
		const method = request.method?.toUpperCase() ?? 'GET'
		const payload = await getRequestPayload(request)
		const runDefault = async () => {
			if (method === 'GET') {
				const url = new URL(request.url, baseUrl)
				const token = url.searchParams.get('token')
				const identifier = url.searchParams.get('identifier')
				const hasToken = Boolean(token && identifier)
				const html = renderPasswordResetPage({
					actionUrl: new URL(joinPath(basePath, '/password/reset/confirm'), baseUrl).toString(),
					token,
					identifier,
					signInUrl: new URL(pluginOptions.pages?.signIn ?? '/signin', baseUrl).toString(),
					message: hasToken
						? undefined
						: {
								text: 'This reset link is missing required details or may have expired. Request a new email.',
								variant: 'error'
							}
				})
				return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
			}
			if (method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })
			const wantsJson = (request.headers.get('accept') ?? '').toLowerCase().includes('application/json')
			const htmlHeaders = { 'content-type': 'text/html; charset=utf-8' }
			const jsonHeaders = { 'content-type': 'application/json' }
			const actionUrl = new URL(joinPath(basePath, '/password/reset/confirm'), baseUrl).toString()
			const signInUrl = new URL(pluginOptions.pages?.signIn ?? '/signin', baseUrl)

			const respondJson = (status: number, body?: Record<string, unknown>) =>
				new Response(body ? JSON.stringify(body) : null, { status, headers: jsonHeaders })

			const respondHtml = (
				status: number,
				message: PasswordResetMessage,
				fields?: { token?: string | null; identifier?: string | null }
			) =>
				new Response(
					renderPasswordResetPage({
						actionUrl,
						token: fields?.token ?? null,
						identifier: fields?.identifier ?? null,
						signInUrl: signInUrl.toString(),
						message
					}),
					{ status, headers: htmlHeaders }
				)

			const invalidLink = () =>
				wantsJson
					? respondJson(400, { error: 'invalid_reset_link' })
					: respondHtml(400, {
							text: 'This reset link is invalid or has expired. Request a new email.',
							variant: 'error'
						})

			const extractString = (value: unknown): string | undefined => {
				if (typeof value === 'string') return value
				if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
				return undefined
			}

			try {
				const record = payload.get()
				const token = extractString(record['token'])?.trim()
				const identifier = extractString(record['identifier'])?.trim().toLowerCase()
				const newPassword = extractString(record['password'])?.trim()

				payload.assign({ token, identifier, password: newPassword })

				if (!token || !identifier) return invalidLink()
				if (!newPassword) {
					return wantsJson
						? respondJson(400, { error: 'missing_password' })
						: respondHtml(400, { text: 'Enter a new password to continue.', variant: 'error' }, { token, identifier })
				}
				if (newPassword.length < 8) {
					return wantsJson
						? respondJson(400, { error: 'password_too_short', minLength: 8 })
						: respondHtml(
								400,
								{ text: 'Passwords must be at least 8 characters long.', variant: 'error' },
								{ token, identifier }
							)
				}

				const used = await adapter.useVerificationToken?.({ identifier, token })
				if (!used) return invalidLink()
				const user = await adapter.getUserByEmail?.(identifier)
				if (!user) return invalidLink()
				try {
					const uid = await adapter.findUserIdByEmail(identifier)
					if (uid) await adapter.resetUserPassword({ userId: uid, password: newPassword })
					await notifyEmail('password:reset-completed', {
						user: { id: user.id, email: user.email ?? null, name: user.name ?? null },
						request: { origin: baseUrl }
					})
				} catch (error) {
					authLogger.warn('Failed to send password reset confirmation email', error)
				}

				if (wantsJson) {
					return respondJson(200, { status: 'ok' })
				}
				const redirectUrl = new URL(signInUrl)
				redirectUrl.searchParams.set('passwordReset', 'success')
				return Response.redirect(redirectUrl.toString(), 303)
			} catch (error) {
				authLogger.warn('Password reset confirmation failed', { error: (error as Error)?.message })
				return wantsJson
					? respondJson(400, { error: 'invalid_request' })
					: respondHtml(400, {
							text: 'We could not update your password. Try again from the reset email.',
							variant: 'error'
						})
			}
		}
		if (overrides?.passwordResetConfirm) {
			return overrides.passwordResetConfirm({
				adapter,
				authConfig,
				basePath,
				baseUrl,
				cookies,
				defaultHandler: runDefault,
				events,
				payload,
				request,
				secret,
				sessionStrategy
			})
		}
		return runDefault()
	})
}

function registerCredentialsInterceptor(options: EmailPasswordRuntimeOptions): void {
	const { adapter, basePath, cookies, handler, recentSigninNotified, sessionStrategy, authConfig } = options

	if (sessionStrategy === 'database') {
		authLogger.debug('Enabling credentials callback interception for DB session cookie issuance.')
	}

	const credentialsCallbackPath = joinPath(basePath, '/callback/credentials')
	Server.registerRoute(credentialsCallbackPath, async (request: RoboRequest, reply: RoboReply) => {
		const method = request.method?.toUpperCase() ?? 'GET'
		if (method !== 'POST') {
			return handler(request, reply)
		}

		let emailFromBody: string | null = null
		try {
			const payload = await getRequestPayload(request)
			const record = payload.get()
			const raw = record['email']
			if (typeof raw === 'string') {
				emailFromBody = raw.toLowerCase()
			} else if (Array.isArray(raw) && typeof raw[0] === 'string') {
				emailFromBody = raw[0].toLowerCase()
			}
			if (emailFromBody) {
				payload.assign({ email: emailFromBody })
			}
		} catch (error) {
			authLogger.warn('Failed to parse email from credentials sign-in request', error)
		}

		const response = await handler(request, reply)
		if (!isSuccessRedirect(response)) {
			return response
		}

		const userId = emailFromBody ? await adapter.findUserIdByEmail(emailFromBody) : null
		if (userId) {
			const ip =
				request.headers.get('cf-connecting-ip') ??
				(request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || undefined)
			const userAgent = request.headers.get('user-agent') ?? undefined
			try {
				await notifyEmail('session:created', {
					user: { id: userId, email: emailFromBody ?? undefined, name: emailFromBody?.split('@')[0] },
					session: { ip: ip ?? null, userAgent: userAgent ?? null }
				})
				recentSigninNotified.add(userId)
			} catch (error) {
				authLogger.warn('Failed to send sign-in email', error)
			}
		}

		if (sessionStrategy === 'database' && userId) {
			try {
				return await attachDbSessionCookie({
					response,
					adapter,
					cookies,
					config: authConfig,
					userId
				})
			} catch (error) {
				authLogger.warn('Failed to create DB session for credentials login', { error: (error as Error)?.message })
				return response
			}
		}

		return response
	})
}

export function registerEmailPasswordRuntime(options: EmailPasswordRuntimeOptions): void {
	registerSignupRoute(options)
	registerVerifyEmailRoutes(options)
	registerPasswordResetRoutes(options)
	registerCredentialsInterceptor(options)
}
