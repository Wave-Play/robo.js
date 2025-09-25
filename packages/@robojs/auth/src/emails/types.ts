export type AuthEmailEvent =
  | 'user:created'
  | 'session:created'
  | 'email:verification-requested'
  | 'email:verified'
  | 'password:reset-requested'
  | 'password:reset-completed'

export type MailParty = string | { name?: string; address: string }

export type EmailContext = {
  user: { id: string; email?: string | null; name?: string | null }
  session?: { id?: string | null; ip?: string | null; userAgent?: string | null }
  tokens?: { verifyEmail?: string; resetPassword?: string }
  request?: { origin?: string | null }
  links?: { verifyEmail?: string; resetPassword?: string }
}

export type MailAttachment = {
  filename: string
  content: Buffer | string
  contentType?: string
}

export type MailMessage = {
  to: MailParty
  from?: MailParty
  subject: string
  html?: string
  text?: string
  headers?: Record<string, string>
  attachments?: MailAttachment[]
  tags?: string[]
}

export interface AuthMailer {
  send(message: MailMessage): Promise<{ id?: string } | void>
  verify?(): Promise<void>
  shutdown?(): Promise<void>
}

export type TemplateConfig =
  | {
      subject: string | ((ctx: EmailContext) => string)
      html?: string | ((ctx: EmailContext) => string)
      text?: string | ((ctx: EmailContext) => string)
    }
  | {
      templateId: string
      variables?: (ctx: EmailContext) => Record<string, unknown>
    }

export type EmailBuilder = (ctx: EmailContext) => MailMessage | null | Promise<MailMessage | null>
