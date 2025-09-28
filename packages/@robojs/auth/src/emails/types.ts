/** Events that can trigger custom email workflows. */
export type AuthEmailEvent =
	| 'user:created'
	| 'session:created'
	| 'email:verification-requested'
	| 'email:verified'
	| 'password:reset-requested'
	| 'password:reset-completed'

/** Accepts either an email address string or a structured `{ name, address }` object. */
export type MailParty = string | { name?: string; address: string }

/** Data passed to email templates and builders. */
export type EmailContext = {
	user: { id: string; email?: string | null; name?: string | null }
	session?: { id?: string | null; ip?: string | null; userAgent?: string | null }
	tokens?: { verifyEmail?: string; resetPassword?: string }
	request?: { origin?: string | null }
	links?: { verifyEmail?: string; resetPassword?: string }
}

/** Ad-hoc attachment payload supplied to a mailer. */
export type MailAttachment = {
	filename: string
	content: Buffer | string
	contentType?: string
}

/** Message contract understood by mail adapters and builders. */
export type MailMessage = {
	to: MailParty
	from?: MailParty
	subject: string
	html?: string
	text?: string
	templateId?: string
	variables?: Record<string, unknown>
	headers?: Record<string, string>
	attachments?: MailAttachment[]
	tags?: string[]
}

/** Interface mail adapter implementations must satisfy. */
export interface AuthMailer {
	send(message: MailMessage): Promise<{ id?: string } | void>
	verify?(): Promise<void>
	shutdown?(): Promise<void>
}

/** Helper representing a value or promise thereof. */
export type MaybePromise<T> = T | Promise<T>

/** Template helper value that can be static, lazy, or computed from context. */
export type TemplateValue<T> = MaybePromise<T> | ((ctx: EmailContext) => MaybePromise<T>)

/** Union describing values accepted by React email renderers. */
export type ReactEmailRenderable = unknown

/** Normalized result from invoking a React template renderer. */
export type ReactTemplateResult = ReactEmailRenderable | null | undefined

/** Function signature for generating React email output. */
export type ReactTemplateRenderer = (ctx: EmailContext) => MaybePromise<ReactTemplateResult>

/** Describes how automated emails are rendered or composed. */
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

/** Builder used to assemble a message on-demand. */
export type EmailBuilder = (ctx: EmailContext) => MailMessage | null | Promise<MailMessage | null>
