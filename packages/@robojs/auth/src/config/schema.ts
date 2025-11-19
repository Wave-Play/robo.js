import { z } from 'zod'
import type { AuthMailer, MailParty, AuthEmailEvent, EmailBuilder, TemplateOverride } from '../emails/types.js'
import type { AuthConfig } from '@auth/core'
import type { Provider } from '@auth/core/providers'

// ---------- TypeScript interfaces with rich JSDoc for IDE tooltips ----------

/**
 * Session configuration.
 *
 * Controls where sessions are stored and how long they last.
 *
 * @property strategy - Defaults to 'database' when an adapter is provided,
 * otherwise 'jwt'.
 * @property maxAge - Maximum lifetime in seconds. Default: 2592000 (30 days).
 * @property updateAge - Refresh interval in seconds. Default: 86400 (24 hours).
 */
export interface SessionOptions {
	/** Session storage strategy: 'jwt' (stateless) or 'database' (server). */
	strategy?: 'jwt' | 'database'
	/** Maximum session lifetime in seconds. @default 2592000 */
	maxAge?: number
	/** Session refresh interval in seconds. @default 86400 */
	updateAge?: number
}

/** Shape accepted by cookie overrides. */
export interface PartialCookieOption {
	/** Custom cookie name. */
	name?: string
	/** Cookie options forwarded to the underlying cookie library. */
	options?: unknown
}

/**
 * Cookie overrides for Auth.js cookies. Provide only the cookies you want to
 * customise.
 */
export interface CookiesOptions {
	sessionToken?: PartialCookieOption
	callbackUrl?: PartialCookieOption
	csrfToken?: PartialCookieOption
	pkceCodeVerifier?: PartialCookieOption
	state?: PartialCookieOption
	nonce?: PartialCookieOption
	webauthnChallenge?: PartialCookieOption
}

/** Custom page paths to override Auth.js defaults. */
export interface PagesOptions {
	signIn?: string
	signOut?: string
	error?: string
	verifyRequest?: string
	newUser?: string
}

/** Callback functions following Auth.js semantics. */
export type CallbacksOptions = AuthConfig['callbacks']

/** Event hooks following Auth.js semantics. */
export type EventsOptions = AuthConfig['events']

/** Fetch signature used by `upstream.fetch`. */
export type FetchLike = (input: string, init?: unknown) => Promise<Response>

/**
 * Upstream proxy configuration for forwarding auth routes to another Robo
 * instance.
 *
 * @property baseUrl - Required absolute URL of the upstream instance.
 * @property basePath - Remote auth path. Defaults to local `basePath`.
 * @property headers - Extra headers forwarded to the upstream.
 * @property cookieName - Session cookie name used by the upstream.
 * @property secret - Optional secret enabling local JWT decoding.
 * @property sessionStrategy - Defaults to local strategy when omitted.
 * @property fetch - Custom fetch implementation if needed.
 *
 * @example
 * {
 *   baseUrl: 'https://auth.myapp.com',
 *   basePath: '/api/auth',
 *   headers: { 'x-tenant': 'acme' }
 * }
 */
export interface UpstreamOptions {
	baseUrl: string
	basePath?: string
	headers?: Record<string, string>
	cookieName?: string
	secret?: string
	sessionStrategy?: 'jwt' | 'database'
	fetch?: FetchLike
}

/** Generic function schema used for callback/event function validation. */
const functionSchema = z.function().args(z.any()).returns(z.any())

/**
 * Email identity accepted by the email system.
 *
 * Accepts a string email (e.g. "hello@example.com") or a structured object
 * with `name` and `address` fields for more readable From/To headers.
 *
 * @example "no-reply@myapp.com"
 * @example { name: "Robo.js", address: "no-reply@myapp.com" }
 */
const mailPartySchema = z.union([
	z.string(),
	z
		.object({
			name: z.string().optional(),
			address: z.string()
		})
		.strict()
])

/**
 * Cookie override configuration allowing you to change cookie `name` and
 * underlying cookie library `options` (path, domain, secure, sameSite, etc.).
 */
const partialCookieSchema = z
	.object({
		name: z.string().optional(),
		options: z.any().optional()
	})
	.strict()

/**
 * Cookie configuration overrides for Auth.js cookies. Each field accepts an
 * object with an optional `name` and cookie `options` to fine‑tune behaviour.
 *
 * See also Auth.js cookie docs for the defaults and semantics.
 */
const cookiesSchema = z
	.object({
		/** Session token cookie used for JWT/database sessions. */
		sessionToken: partialCookieSchema.optional(),
		/** Stores the URL to redirect back to after auth. */
		callbackUrl: partialCookieSchema.optional(),
		/** CSRF protection cookie used by Auth.js. */
		csrfToken: partialCookieSchema.optional(),
		/** PKCE verifier cookie used by OAuth providers supporting PKCE. */
		pkceCodeVerifier: partialCookieSchema.optional(),
		/** OAuth state cookie to prevent CSRF attacks. */
		state: partialCookieSchema.optional(),
		/** OAuth nonce cookie to prevent replay attacks. */
		nonce: partialCookieSchema.optional(),
		/** WebAuthn challenge cookie used during passkey flows. */
		webauthnChallenge: partialCookieSchema.optional()
	})
	.partial()
	.optional()

/**
 * Session configuration schema with strategy, lifetime, and refresh settings.
 */
const sessionSchema = z
	.object({
		/**
		 * Session storage strategy: 'jwt' for stateless cookies or 'database' for
		 * server‑side sessions.
		 */
		strategy: z.enum(['jwt', 'database']).optional(),
		/** Maximum session lifetime in seconds (default: 2592000 = 30 days). */
		maxAge: z.number().int().positive().optional(),
		/** Session refresh interval in seconds (default: 86400 = 24 hours). */
		updateAge: z.number().int().nonnegative().optional()
	})
	.optional()

/** Custom page paths to override default Auth.js UI pages. */
const pagesSchema = z
	.object({
		/** Path to a custom sign‑in page. @example "/login" */
		signIn: z.string().optional(),
		/** Path to a custom sign‑out page. */
		signOut: z.string().optional(),
		/** Path to a custom error page used by Auth.js. */
		error: z.string().optional(),
		/** Path shown after sending a magic link or verification email. */
		verifyRequest: z.string().optional(),
		/** Path shown for first‑time users after account creation. */
		newUser: z.string().optional()
	})
	.partial()
	.optional()

/**
 * Auth.js callback functions for customizing authentication flow behaviour.
 *
 * Note: This schema validates entries as functions (stricter than accepting
 * `any`). Older configurations that used non-function values will now fail
 * validation and should be updated to pass functions.
 *
 * @see https://authjs.dev/reference/core/types#callbacks
 */
const callbacksSchema = z
	.object({
		signIn: functionSchema.optional(),
		redirect: functionSchema.optional(),
		session: functionSchema.optional(),
		jwt: functionSchema.optional()
	})
	.partial()
	.optional()

/**
 * Auth.js event hooks fired during user and session lifecycle. The plugin may
 * compose these with built‑in notifications (e.g. emails).
 *
 * Note: Like callbacks, this schema validates entries as functions. If you
 * previously supplied non-function values, update them to functions.
 *
 * @see https://authjs.dev/reference/core/types#events
 */
const eventsSchema = z
	.object({
		createUser: functionSchema.optional(),
		updateUser: functionSchema.optional(),
		linkAccount: functionSchema.optional(),
		session: functionSchema.optional(),
		signIn: functionSchema.optional(),
		signOut: functionSchema.optional()
	})
	.partial()
	.optional()

/**
 * ⚠️ Deprecated legacy email configuration that predates the richer `emails`
 * block. Maintained for backwards compatibility with older Auth.js setups.
 *
 * @remarks Migrate by moving `email.from` → `emails.from`,
 * `email.template` → `emails.templates['email:verification-requested']`, and
 * custom delivery functions into `emails.mailer` or `emails.triggers`.
 */
const emailSchema = z
	.object({
		/** Sender email address (prefer `emails.from`). */
		from: z.string().optional(),
		/** HTML template string or function (prefer `emails.templates`). */
		template: z.union([z.string(), functionSchema]).optional(),
		subject: z.union([z.string(), functionSchema]).optional(),
		text: z.union([z.string(), functionSchema]).optional(),
		deliver: functionSchema.optional(),
		/** Custom delivery function (prefer `emails.mailer`). */
		sendVerificationRequest: functionSchema.optional(),
		expiresInMinutes: z.number().int().positive().optional()
	})
	.partial()
	.optional()

/**
 * Validates the rich email configuration covering sender identity, mailer
 * wiring, template overrides, and event triggers.
 *
 * @remarks All properties are optional—if no mailer is provided, email
 * notifications are skipped without throwing. Templates and triggers can be
 * combined: templates provide defaults while triggers add bespoke workflows.
 *
 * @see EmailsOptions
 * @see README.md#email-delivery
 */
const emailsSchema = z
	.object({
		/**
		 * Default sender (string or `{ name, address }`). Used when templates or
		 * builders omit `from`.
		 */
		from: mailPartySchema.optional(),
		/**
		 * Mailer implementation: AuthMailer instance, lazy factory, or module spec
		 * ({ module, export? }). Missing mailer => emails are skipped.
		 */
		mailer: z.unknown().optional(),
		/**
		 * Per-event template overrides. Accepts inline content, React renderers,
		 * provider `templateId`, or `false` to disable.
		 */
		templates: z.record(z.any()).optional(),
		/**
		 * Custom builders (single function or array) executed for specific
		 * events. Return `null` to skip sending.
		 */
		triggers: z.record(z.any()).optional()
	})
	.partial()
	.optional()

const fetchLikeSchema = z.function().args(z.any()).returns(z.any())

/**
 * Upstream proxy configuration for forwarding auth routes to another Robo
 * instance.
 *
 * @example
 * {
 *   baseUrl: 'https://auth.myapp.com',
 *   basePath: '/api/auth',
 *   headers: { 'x-tenant': 'acme' }
 * }
 */
const upstreamSchema = z
	.object({
		/** Absolute URL of the upstream Robo instance handling auth. */
		baseUrl: z.string().url(),
		/** Remote auth path (defaults to local `basePath`). */
		basePath: z.string().optional(),
		/** Additional headers forwarded to the upstream on each request. */
		headers: z.record(z.string()).optional(),
		/**
		 * Name of the session cookie used by the upstream.
		 * @default "authjs.session-token"
		 */
		cookieName: z.string().optional(),
		/** Optional secret to enable local JWT decoding without network calls. */
		secret: z.string().optional(),
		/**
		 * Overrides the session strategy used when proxying. Falls back to the
		 * local (resolved) session strategy when omitted.
		 */
		sessionStrategy: z.enum(['jwt', 'database']).optional(),
		/** Custom fetch implementation (useful for SSR/edge runtimes). */
		fetch: fetchLikeSchema.optional()
	})
	.strict()

/**
 * Zod schema enforcing the structure of `@robojs/auth` plugin configuration.
 *
 * @example
 * ```ts
 * const config = authPluginOptionsSchema.parse({ basePath: '/api/auth' })
 * ```
 *
 * @see AuthPluginOptions
 */
export const authPluginOptionsSchema = z
	.object({
		/**
		 * Display name for your app (used in emails and UI).
		 * @default "Robo.js"
		 */
		appName: z.string().optional(),
		/** Storage adapter for users, sessions, and accounts. */
		adapter: z.unknown().optional(),
		/**
		 * ⚠️ Security: auto‑link accounts by email across OAuth providers.
		 * Leave disabled unless you fully trust every provider.
		 */
		allowDangerousEmailAccountLinking: z.boolean().optional(),
		/**
		 * Base path for all auth routes.
		 * @default "/api/auth"
		 * @example "/api/auth"
		 * @example "/auth"
		 */
		basePath: z.string().optional(),
		/** Auth.js callback hooks. */
		callbacks: callbacksSchema,
		/** Cookie overrides for Auth.js cookies. */
		cookies: cookiesSchema,
		/** Enable verbose Auth.js debug logging. */
		debug: z.boolean().optional(),
		/** Auth.js event handlers. */
		events: eventsSchema,
		/** Legacy email config (prefer `emails`). */
		email: emailSchema,
		/** Rich email system configuration. */
		emails: emailsSchema,
		/** Custom UI pages for Auth.js. */
		pages: pagesSchema,
		/** Array of authentication providers. */
		providers: z.array(z.any()).optional(),
		/** Proxy URL used for preview deployments to build correct redirects. */
		redirectProxyUrl: z.string().url().optional(),
		/**
		 * Secret for JWT signing and token hashing.
		 *
		 * ⚠️ Security: Required in production. Reads from `AUTH_SECRET` or
		 * `NEXTAUTH_SECRET` when not explicitly provided.
		 * @example process.env.AUTH_SECRET
		 */
		secret: z.string().min(1).optional(),
		/** Session strategy and timing controls. */
		session: sessionSchema,
		/** Forward all auth routes to another Robo instance. */
		upstream: upstreamSchema.optional(),
		/** Canonical application URL used by Auth.js in redirects. */
		url: z.string().url().optional()
	})
	.strict()


/**
 * Email system configuration controlling sender identity, mailer wiring,
 * template overrides, and event-driven triggers.
 *
 * @remarks Mirrors the shape validated by {@link emailsSchema}. For practical
 * integration examples (Resend, React Email, template disabling) see
 * `packages/@robojs/auth/README.md`.
 */
export interface EmailsOptions {
	/**
	 * Default sender for all automated emails (string or `{ name, address }`).
	 * Individual builders/templates can override `from` per message.
	 *
	 * @example 'noreply@example.com'
	 * @example { name: 'Robo.js', address: 'bot@example.com' }
	 * @see MailParty
	 */
	from?: MailParty
	/**
	 * Mailer reference used to deliver messages.
	 *
	 * Supports:
	 * 1. Direct {@link AuthMailer} instance (e.g. `createResendMailer({ apiKey, from })`)
	 * 2. Lazy factory returning a mailer (sync or async) for deferred imports
	 * 3. Module spec `{ module: string, export?: string }` resolved at runtime
	 *
	 * When using `{ module, export? }`, the resolved export must implement `AuthMailer`, 
	 * not a raw SDK class.
	 *
	 * ⚠️ If the mailer implements `verify()`, it is called during startup to
	 * catch misconfiguration early. When omitted entirely, the system logs and
	 * skips email delivery instead of crashing.
	 *
	 * @example ResendMailer({ apiKey: process.env.RESEND_API_KEY!, from: 'bot@example.com' })
	 * @example () => createResendMailer({ apiKey: process.env.RESEND_API_KEY!, from: 'bot@example.com' })
	 * @example { module: './my-mailer.js' }
	 */
	mailer?: AuthMailer | (() => Promise<AuthMailer> | AuthMailer) | { module: string; export?: string }
	/**
	 * Per-event template overrides or `false` to suppress an event entirely.
	 *
	 * Supports inline subject/html/text values, React renderers (via
	 * `@react-email/components`), provider templates via `templateId`, and
	 * selective field overrides merged with the defaults.
	 *
	 * Events: 'user:created', 'session:created',
	 * 'email:verification-requested', 'email:verified',
	 * 'password:reset-requested', 'password:reset-completed'.
	 *
	 * @example { 'user:created': { subject: 'Welcome', text: ctx => `Hi ${ctx.user.email}` } }
	 * @example { 'password:reset-requested': { subject: 'Reset Password', react: ctx => <ResetEmail {...ctx} /> } }
	 * @example { 'session:created': false }
	 * @see TemplateOverride
	 */
	templates?: Partial<Record<AuthEmailEvent, TemplateOverride>>
	/**
	 * Custom builders executed when specific email events fire. Accepts a single
	 * builder or an array executed sequentially. Return `null` to skip sending
	 * (useful for conditional logic or audit-only hooks).
	 *
	 * Builders run before template rendering and receive the full
	 * {@link EmailContext} (user, session, links, tokens, etc.).
	 *
	 * @example {
	 *   'password:reset-requested': [auditLogBuilder, smsAlertBuilder]
	 * }
	 * @see EmailBuilder
	 */
	triggers?: Partial<Record<AuthEmailEvent, EmailBuilder | EmailBuilder[]>>
}

/**
 * Configuration options for the `@robojs/auth` plugin.
 *
 * Refer to the plugin README for a comprehensive table of options and
 * defaults. The CLI applies sane defaults; most fields are optional.
 *
 * Notable defaults:
 * - `basePath`: "/api/auth"
 * - `session.maxAge`: 2592000 (30 days)
 * - `session.updateAge`: 86400 (24 hours)
 * - `session.strategy`: 'database' when an adapter is present, otherwise 'jwt'
 *
 * Security notes:
 * - `allowDangerousEmailAccountLinking` should remain `false` unless all OAuth
 *   providers are fully trusted.
 */
export interface AuthPluginOptions {
	/**
	 * Display name for the application. Used in emails and default UI strings.
	 * @default "Robo.js"
	 * @example "My Awesome App"
	 */
	appName?: string

	/**
	 * Storage adapter for users, sessions, and accounts.
	 * @example createFlashcoreAdapter({ secret: process.env.AUTH_SECRET! })
	 */
	adapter?: unknown

	/**
	 * ⚠️ Security: automatically link accounts by email across OAuth providers.
	 * Only enable if you fully trust every provider to verify email ownership.
	 * @default false
	 */
	allowDangerousEmailAccountLinking?: boolean

	/**
	 * Base path for all auth routes.
	 * @default "/api/auth"
	 * @example "/api/auth"
	 * @example "/auth"
	 */
	basePath?: string

	/** Auth.js callback hooks. */
	callbacks?: CallbacksOptions

	/** Cookie overrides for Auth.js cookies. */
	cookies?: CookiesOptions

	/** Enable verbose Auth.js debug logging. @default false */
	debug?: boolean

	/** Auth.js event handlers. */
	events?: EventsOptions

	/** Legacy email configuration (prefer the richer `emails` object). */
	email?: z.infer<typeof emailSchema>

	/** Email system configuration: mailer, templates, and triggers. */
	emails?: EmailsOptions

	/** Custom UI page paths for Auth.js built‑in routes. */
	pages?: PagesOptions

	/** Array of authentication providers (OAuth, email, credentials). @default [] */
	providers?: Provider[]

	/** Proxy URL used on preview deployments to build correct redirects. */
	redirectProxyUrl?: string

	/**
	 * Secret for JWT signing and token hashing.
	 *
	 * ⚠️ Security: Required in production. Reads from `AUTH_SECRET` or
	 * `NEXTAUTH_SECRET`.
	 * @example process.env.AUTH_SECRET
	 */
	secret?: string

	/**
	 * Session strategy and timing controls.
	 * @default strategy: adapter ? 'database' : 'jwt', maxAge: 2592000, updateAge: 86400
	 */
	session?: SessionOptions

	/**
	 * Forward all auth routes to another Robo instance.
	 *
	 * @default cookieName: "authjs.session-token"; sessionStrategy falls back to local strategy when omitted
	 */
	upstream?: UpstreamOptions

	/** Canonical app URL used by Auth.js in redirects. */
	url?: string
}
