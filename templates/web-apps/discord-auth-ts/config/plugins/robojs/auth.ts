import Discord from '@robojs/auth/providers/discord'
import EmailPassword from '@robojs/auth/providers/email-password'
// import ResendMailer from '@robojs/auth/emails/resend'
import { createFlashcoreAdapter } from '@robojs/auth'
import type { AuthPluginOptions } from '@robojs/auth/types'

const adapter = createFlashcoreAdapter({ secret: process.env.AUTH_SECRET! })

const config: AuthPluginOptions = {
  adapter: adapter,
  appName: 'Robo Template',
  /*
  Uncomment to enable email sending via Resend.com

  emails: {
    from: 'example@robojs.dev',
    mailer: ResendMailer({ apiKey: process.env.RESEND_API_KEY! })
  },
  */
  providers: [
    Discord({ clientId: process.env.DISCORD_CLIENT_ID, clientSecret: process.env.DISCORD_CLIENT_SECRET }),
    EmailPassword({ adapter })
  ],
  secret: process.env.AUTH_SECRET
}

export default config
 
