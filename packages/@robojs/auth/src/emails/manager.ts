import { authLogger as baseLogger } from '../utils/logger.js'
import type {
	AuthEmailEvent,
	AuthMailer,
	EmailBuilder,
	EmailContext,
	MailParty,
	TemplateConfig,
	TemplateOverride,
	TemplateValue
} from './types.js'
import { DefaultWelcomeTemplate } from './templates/welcome.js'
import { DefaultSignInTemplate } from './templates/signin.js'
import { renderReactTemplate } from './react-renderer.js'
import {
	DefaultPasswordResetCompletedTemplate,
	DefaultPasswordResetRequestTemplate
} from './templates/password-reset.js'
import { DefaultEmailVerificationTemplate } from './templates/verification.js'

type ModuleMailerSpec = { module: string; export?: string }

type EmailsConfig = {
	from?: MailParty
	mailer?: AuthMailer | (() => Promise<AuthMailer> | AuthMailer) | ModuleMailerSpec
	templates?: Partial<Record<AuthEmailEvent, TemplateOverride>>
	triggers?: Partial<Record<AuthEmailEvent, EmailBuilder | EmailBuilder[]>>
}

let instance: EmailManager | undefined

/** Registers a singleton email manager used by runtime triggers. */
export function setEmailManager(mgr: EmailManager | undefined) {
	instance = mgr
}

/** Retrieves the active email manager instance, if configured. */
export function getEmailManager() {
	return instance
}

/** Dispatches an email event through configured builders and mailers. */
export async function notifyEmail(event: AuthEmailEvent, ctx: EmailContext) {
	if (!instance) return

	await instance.notify(event, ctx)
}

/** Coordinates mailer lifecycle, template resolution, and trigger execution. */
export class EmailManager {
	private mailer?: AuthMailer
	private from?: MailParty
	private templates: NonNullable<EmailsConfig['templates']> = {}
	private triggers: Partial<Record<AuthEmailEvent, EmailBuilder[]>> = {}
	private logger = baseLogger.fork('emails')

	constructor(private opts: EmailsConfig) {}

	async init() {
		this.from = this.opts.from
		this.templates = this.opts.templates ?? {}
		this.logger.debug('Initializing EmailManager', {
			hasMailer: Boolean(this.opts.mailer),
			hasTemplates: Object.keys(this.templates).length > 0,
			hasTriggers: Boolean(this.opts.triggers)
		})
		// Canonicalize trigger definitions to arrays for easier iteration later on.
		if (this.opts.triggers) {
			for (const [event, t] of Object.entries(this.opts.triggers) as [
				AuthEmailEvent,
				EmailBuilder | EmailBuilder[]
			][]) {
				this.triggers[event] = Array.isArray(t) ? t : [t]
			}
		}

		const m = this.opts.mailer
		if (!m) return

		if (typeof m === 'function') {
			// Support lazy mailer factories to defer heavy imports until startup.
			this.mailer = await Promise.resolve(m())
		} else if (typeof (m as ModuleMailerSpec).module === 'string') {
			// Dynamic import allows referencing remote mailers without bundler tricks.
			const spec = m as ModuleMailerSpec
			const mod: Record<string, unknown> = await import(spec.module)
			const resolved = (spec.export ? mod[spec.export] : (mod as { default?: unknown }).default) ?? mod
			this.mailer = resolved as AuthMailer
		} else {
			this.mailer = m as AuthMailer
		}

		if (this.mailer?.verify) await this.mailer.verify()
		this.logger.debug('EmailManager ready')
	}

	async shutdown() {
		if (this.mailer?.shutdown) await this.mailer.shutdown()
	}

	async notify(event: AuthEmailEvent, ctx: EmailContext) {
		if (!this.mailer) {
			this.logger.debug('No mailer configured; skipping email', { event })
			return
		}

		const builders: EmailBuilder[] = [...(this.triggers[event] ?? []), ...this.templateBuilderIfAny(event)]
		if (builders.length === 0) return

		this.logger.debug('Dispatching email builders', { event, count: builders.length })
		for (const build of builders) {
			try {
				// Allow builders to bail out by returning null (e.g., missing recipient).
				const msg = await Promise.resolve(build(ctx))
				if (!msg) continue
				// Merge template output with configured defaults before sending.
				const finalMsg = { from: this.from, ...msg }
				this.logger.debug('Sending message', {
					event,
					to: typeof finalMsg.to === 'string' ? finalMsg.to : finalMsg.to.address,
					subject: finalMsg.subject
				})
				await this.mailer.send(finalMsg)
				this.logger.debug('Email sent', { event })
			} catch (err) {
				const error = err as Error
				this.logger.error('Failed to send email', { event, error: error.message })
			}
		}
	}

	private templateBuilderIfAny(event: AuthEmailEvent): EmailBuilder[] {
		const override = this.templates[event]
		if (override === false) {
			this.logger.debug('Email template disabled; skipping default builder', { event })
			return []
		}
		const userT = override
		const defaultT = this.getDefaultTemplate(event)
		let t: TemplateConfig | undefined
		if (userT) {
			if ('templateId' in userT) {
				// Provider-driven templates are forwarded as-is to the mailer.
				t = userT
			} else if (defaultT && 'subject' in defaultT) {
				// Merge inline template parts with defaults (subject/html/text/react)
				t = {
					subject: userT.subject ?? defaultT.subject,
					html: userT.html ?? defaultT.html,
					text: userT.text ?? defaultT.text,
					react: userT.react ?? defaultT.react
				}
			} else {
				t = userT
			}
		} else {
			t = defaultT
		}
		if (!t) return []
		return [
			async (ctx) => {
				const to = ctx.user.email
				if (!to) return null

				if ('templateId' in t) {
					// Hand off template IDs directly; React/email builders are bypassed entirely.
					const varFn = (t as { variables?: (c: EmailContext) => Record<string, unknown> }).variables
					const vars = typeof varFn === 'function' ? varFn(ctx) : undefined
					return { to, subject: ' ', templateId: (t as { templateId: string }).templateId, variables: vars }
				}
				const subject = await resolveValue(t.subject, ctx)
				if (subject == null) {
					throw new Error(`Email template for "${event}" must return a subject string.`)
				}
				const [reactHtml, html] = await Promise.all([
					'react' in t ? renderReactTemplate(t.react, ctx) : Promise.resolve(undefined),
					resolveValue(t.html, ctx)
				])
				const text = await resolveValue(t.text, ctx)

				return { to, subject, html: reactHtml ?? html, text }
			}
		]
	}

	private getDefaultTemplate(event: AuthEmailEvent): TemplateConfig | undefined {
		if (event === 'user:created') return DefaultWelcomeTemplate
		if (event === 'session:created') return DefaultSignInTemplate
		if (event === 'email:verification-requested') return DefaultEmailVerificationTemplate
		if (event === 'password:reset-requested') return DefaultPasswordResetRequestTemplate
		if (event === 'password:reset-completed') return DefaultPasswordResetCompletedTemplate
		return undefined
	}
}

async function resolveValue<T>(value: TemplateValue<T> | undefined, ctx: EmailContext): Promise<T | undefined> {
	if (typeof value === 'function') {
		return await (value as (ctx: EmailContext) => Promise<T> | T)(ctx)
	}
	if (value && typeof value === 'object' && 'then' in (value as Record<string, unknown>)) {
		return await (value as Promise<T>)
	}

	return value
}
