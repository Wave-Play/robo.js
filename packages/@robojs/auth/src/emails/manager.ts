import { authLogger as baseLogger } from '../utils/logger.js'
import type { AuthEmailEvent, AuthMailer, EmailBuilder, EmailContext, MailParty, TemplateConfig } from './types.js'
import { DefaultWelcomeTemplate } from './templates/welcome.js'
import { DefaultSignInTemplate } from './templates/signin.js'

type ModuleMailerSpec = { module: string; export?: string }

type EmailsConfig = {
	from?: MailParty
	mailer?: AuthMailer | (() => Promise<AuthMailer> | AuthMailer) | ModuleMailerSpec
	templates?: Partial<Record<AuthEmailEvent, TemplateConfig>>
	triggers?: Partial<Record<AuthEmailEvent, EmailBuilder | EmailBuilder[]>>
}

let instance: EmailManager | undefined

export function setEmailManager(mgr: EmailManager | undefined) {
	instance = mgr
}

export function getEmailManager() {
	return instance
}

export async function notifyEmail(event: AuthEmailEvent, ctx: EmailContext) {
	if (!instance) return
	await instance.notify(event, ctx)
}

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
			this.mailer = await Promise.resolve(m())
		} else if (typeof (m as ModuleMailerSpec).module === 'string') {
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
				const msg = await Promise.resolve(build(ctx))
				if (!msg) continue
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
		const userT = this.templates[event]
		const defaultT = this.getDefaultTemplate(event)
		let t: TemplateConfig | undefined = undefined
		if (userT) {
			// If user provided a provider-native template, use it as-is
			if ('templateId' in userT) {
				t = userT
			} else if (defaultT && !('templateId' in defaultT)) {
				// Merge inline template parts with defaults (subject/html/text)
				t = {
					subject: (userT.subject ?? defaultT.subject) as TemplateConfig extends { subject: infer S } ? S : never,
					html: userT.html ?? defaultT.html,
					text: userT.text ?? defaultT.text
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
					// Provider-native template; leave subject mostly to provider config
					return { to, subject: ' ', headers: { 'X-Template-Id': (t as { templateId: string }).templateId } }
				}
				const subject = typeof t.subject === 'function' ? t.subject(ctx) : t.subject
				const html = typeof t.html === 'function' ? t.html(ctx) : t.html
				const text = typeof t.text === 'function' ? t.text(ctx) : t.text
				return { to, subject, html, text }
			}
		]
	}

	private getDefaultTemplate(event: AuthEmailEvent): TemplateConfig | undefined {
		if (event === 'user:created') return DefaultWelcomeTemplate
		if (event === 'session:created') return DefaultSignInTemplate
		return undefined
	}
}
