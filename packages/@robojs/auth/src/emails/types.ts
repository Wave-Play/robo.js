/**
 * Events that can trigger custom email workflows.
 *
 * - `"user:created"`: fired after a user signs up (email/password or first OAuth login)
 * - `"session:created"`: fired when a new session is established (new device/IP)
 * - `"email:verification-requested"`: fired when a verification link is issued
 * - `"email:verified"`: fired once a verification link is confirmed
 * - `"password:reset-requested"`: fired when a password reset link is issued
 * - `"password:reset-completed"`: fired after a successful password change
 *
 * Default templates ship for every event except `"email:verified"`. Each event
 * can define custom templates and builders via {@link EmailsOptions}.
 */
export type AuthEmailEvent =
	| 'user:created'
	| 'session:created'
	| 'email:verification-requested'
	| 'email:verified'
	| 'password:reset-requested'
	| 'password:reset-completed'

/**
 * Represents an email party (sender or recipient). Accepts either a bare email
 * string or a structured `{ name, address }` object (name optional) for
 * readable headers such as `"Robo.js <noreply@example.com>"`.
 *
 * @example 'admin@example.com'
 * @example { name: 'Robo.js', address: 'noreply@example.com' }
 * @example { address: 'support@example.com' }
 */
export type MailParty = string | { name?: string; address: string }

/**
 * Contextual data passed to every email template or builder, enabling
 * personalized content and conditional workflows.
 *
 * @example
 * ```ts
 * const greeting = `Hi ${ctx.user.name ?? 'there'}`
 * const auditNote = ctx.session?.ip ? `IP ${ctx.session.ip}` : 'No session data'
 * ```
 */
export type EmailContext = {
	/** Application display name from config (defaults to "Robo.js"). */
	appName: string
	/** Adapter user record (email/name may be null for certain providers). */
	user: { id: string; email?: string | null; name?: string | null }
	/** Session metadata present for the `session:created` event. */
	session?: { id?: string | null; ip?: string | null; userAgent?: string | null }
	/** Raw tokens for verification/reset flows (use links for user-facing URLs). */
	tokens?: { verifyEmail?: string; resetPassword?: string }
	/**
	 * Request metadata such as origin/base URL used to build links. May be
	 * undefined when the request context is not available (e.g. background jobs).
	 */
	request?: { origin?: string | null }
	/** Pre-built absolute URLs for verification or password reset actions. */
	links?: { verifyEmail?: string; resetPassword?: string }
}

/**
 * Attachment payload supplied to a mailer when sending transactional emails.
 * Not every provider supports attachments—consult your mailer for limits.
 *
 * @example { filename: 'receipt.pdf', content: pdfBuffer, contentType: 'application/pdf' }
 */
export type MailAttachment = {
	/** Filename visible to recipients (e.g. `invoice.pdf`). */
	filename: string
	/** File data, either as a Buffer or base64 string. */
	content: Buffer | string
	/** MIME type for the attachment. Many providers infer this automatically. */
	contentType?: string
}

/**
 * Message contract understood by mail adapters and builders. Includes support
 * for inline HTML/text or provider-managed templates via `templateId`.
 *
 * @example
 * ```ts
 * { to: user.email!, subject: 'Welcome', html: '<p>Hello!</p>', text: 'Hello!' }
 * ```
 * @example
 * ```ts
 * {
 *   to: user.email!,
 *   subject: '',
 *   templateId: 'd-reset',
 *   variables: { userName: user.name, link: ctx.links?.resetPassword }
 * }
 * ```
 * @example
 * ```ts
 * {
 *   to: user.email!,
 *   subject: 'Invoice',
 *   html: '<p>Attached invoice</p>',
 *   attachments: [{ filename: 'invoice.pdf', content: pdfBuffer }]
 * }
 * ```
 */
export type MailMessage = {
	/** Recipient address. */
	to: MailParty
	/** Optional sender override (falls back to `emails.from`). */
	from?: MailParty
	/** Subject line, required for inline templates. */
	subject: string
	/** Rich HTML body; ignored when `templateId` is provided. */
	html?: string
	/** Plain-text fallback body. */
	text?: string
	/** Provider template identifier (SendGrid dynamic templates, Postmark, etc.). */
	templateId?: string
	/** Variables consumed by provider templates. */
	variables?: Record<string, unknown>
	/** Custom headers such as `X-Priority`. */
	headers?: Record<string, string>
	/** Attachments appended to the message. */
	attachments?: MailAttachment[]
	/** Tracking tags supported by providers like Resend or Postmark. */
	tags?: string[]
}

/**
 * Interface mail adapter implementations must satisfy. Implementations may
 * wrap SaaS APIs (Resend, Postmark, SendGrid) or local transports (SMTP).
 */
export interface AuthMailer {
	/**
	 * Deliver a message. Throwing rejects the send and logs an error upstream.
	 *
	 * @returns Optionally return a provider message id for logging.
	 */
	send(message: MailMessage): Promise<{ id?: string } | void>
	/**
	 * Optional hook to verify credentials (called during plugin start). Throw to
	 * block startup when configuration is invalid. ⚠️ Avoid logging secrets.
	 */
	verify?(): Promise<void>
	/** Optional hook to release resources during shutdown. */
	shutdown?(): Promise<void>
}

/** Helper representing a value or promise thereof. */
export type MaybePromise<T> = T | Promise<T>

/**
 * Template helper value that can be static, lazy (Promise), or computed from
 * the {@link EmailContext} at render time.
 *
 * @example 'Welcome to Robo.js'
 * @example (ctx) => `Welcome, ${ctx.user.name ?? 'friend'}`
 * @example async () => fetchCopyFromCMS()
 */
export type TemplateValue<T> = MaybePromise<T> | ((ctx: EmailContext) => MaybePromise<T>)

/** Union describing values accepted by React email renderers. */
export type ReactEmailRenderable = unknown

/** Normalized result from invoking a React template renderer. */
export type ReactTemplateResult = ReactEmailRenderable | null | undefined

/**
 * Function signature for generating React email output using react-email
 * components. Return JSX (sync or async) which the runtime renders to HTML via
 * `react-dom/server`. Requires `@react-email/components` in your project.
 *
 * @see https://react.email
 */
export type ReactTemplateRenderer = (ctx: EmailContext) => MaybePromise<ReactTemplateResult>

/**
 * Describes how automated emails are rendered or composed—either via inline
 * content (subject/html/text/React) or a provider-managed template id.
 *
 * - Inline mode: supply `subject` plus `html`, `text`, and/or `react`
 * - Provider mode: supply `templateId` plus optional `variables`
 *
 * @example
 * ```ts
 * { subject: ctx => `Welcome ${ctx.user.name}`, react: WelcomeEmail }
 * ```
 * @example
 * ```ts
 * { templateId: 'd-reset', variables: ctx => ({ link: ctx.links?.resetPassword }) }
 * ```
 */
export type TemplateConfig =
	| {
			subject: TemplateValue<string>
			html?: TemplateValue<string | undefined>
			text?: TemplateValue<string | undefined>
			react?: ReactTemplateRenderer
	  }
	| {
			templateId: string
			variables?: (ctx: EmailContext) => Record<string, unknown>
	  }

/**
 * User-supplied override merged with the default template. Provide only the
 * fields you want to change; the remaining defaults stay intact. Set to `false`
 * to disable an event's email entirely without affecting other events.
 */
export type TemplateOverride = TemplateConfig | false

/**
 * Builder used to assemble a message on-demand. Return `null` to skip sending
 * when conditions are not met (e.g. suppressing internal traffic alerts).
 * Registered via {@link EmailsOptions.triggers}; builders execute sequentially.
 *
 * @example ctx => ({ to: ctx.user.email!, subject: 'Welcome', html: '<p>Hi</p>' })
 * @example ctx => ctx.session?.ip?.startsWith('192.168.') ? null : adminAlert(ctx)
 */
export type EmailBuilder = (ctx: EmailContext) => MailMessage | null | Promise<MailMessage | null>
