import type { AuthMailer, MailMessage, MailParty } from '../types.js'
import { authLogger } from '../../utils/logger.js'

/** Wire-up options passed to the Resend-backed mailer. */
export type ResendMailerOptions = {
  apiKey: string
  from?: MailParty
}

function normalizeParty(party?: MailParty): string | undefined {
  if (!party) return undefined
  if (typeof party === 'string') return party
  return party.name ? `${party.name} <${party.address}>` : party.address
}

type ResendSendInput = {
  from: string
  to: string | string[]
  subject: string
  html?: string
  text?: string
  attachments?: Array<{ filename: string; content: string | Buffer; contentType?: string }>
  headers?: Record<string, string>
  templateId?: string
  variables?: Record<string, unknown>
}

type ResendClient = {
  emails: { send(input: ResendSendInput): Promise<unknown> }
}

type ResendCtor = new (apiKey: string) => ResendClient

/**
 * Builds an `AuthMailer` implementation backed by the Resend email API.
 *
 * @param opts - Includes the Resend API key and optional default `from` address.
 * @returns An `AuthMailer` that lazily imports the Resend SDK.
 *
 * @example
 * ```ts
 * const mailer = createResendMailer({ apiKey: process.env.RESEND_API_KEY!, from: 'Robo <noreply@example.com>' })
 * ```
 */
export function createResendMailer(opts: ResendMailerOptions): AuthMailer {
  let client: ResendClient | undefined

  async function getClient(): Promise<ResendClient> {
    if (client) return client
    try {
      // Dynamically import the SDK so consumers aren't forced to bundle it unless used.
      const mod: unknown = await import('resend')
      const maybe = mod as { Resend?: ResendCtor; default?: ResendCtor | { Resend?: ResendCtor } }
      const Ctor: ResendCtor | undefined = maybe.Resend ?? (typeof maybe.default === 'function' ? (maybe.default as ResendCtor) : (maybe.default as { Resend?: ResendCtor })?.Resend)
      if (!Ctor) throw new Error('Failed to resolve Resend constructor export')
      client = new Ctor(opts.apiKey)
      authLogger.debug('Initialized Resend client')
      return client
    } catch (err) {
      authLogger.error('Resend SDK not found. Please install "resend" in your project.')
      throw err as Error
    }
  }

  return {
    async send(message: MailMessage) {
      const resend = await getClient()
      const from = normalizeParty(message.from) ?? normalizeParty(opts.from)
      if (!from) throw new Error('Resend mailer requires a "from" address')

      const to = typeof message.to === 'string' ? message.to : normalizeParty(message.to)!
      authLogger.debug('Resend sending', { to, subject: message.subject })

      const attachments = (message.attachments ?? []).map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType
      }))

      const headers = message.headers

      let payload: ResendSendInput = {
        from,
        to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        attachments: attachments.length ? attachments : undefined,
        headers
      }
      if (message.templateId) {
        // Template sends substitute HTML/text with a template reference and variables.
        payload = {
          ...payload,
          templateId: message.templateId,
          variables: message.variables
        }
      }

      const result = await resend.emails.send(payload)
      // Try to derive a useful id or error from the provider response
      const maybeObj = result as unknown as { id?: string; data?: { id?: string }; error?: { message?: string; name?: string; statusCode?: number }; message?: string }
      if (maybeObj?.error) {
        authLogger.error('Resend send failed', { error: maybeObj.error })
        throw new Error(maybeObj.error.message || 'Unknown Resend error')
      }
      if (maybeObj?.message && !maybeObj?.id && !maybeObj?.data?.id) {
        // Some SDK versions may return a message string on failure
        authLogger.error('Resend send failed', { error: maybeObj.message })
        throw new Error(maybeObj.message)
      }
      const id = maybeObj?.id ?? maybeObj?.data?.id
      authLogger.debug('Resend sent OK', { to, id })
      return { id }
    },
    async verify() {
      // No-op: Resend does not require a handshake for API key verification here
      return
    },
    async shutdown() {
      // No persistent connection to close
      return
    }
  }
}
