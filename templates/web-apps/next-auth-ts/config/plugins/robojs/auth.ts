import Discord from '@robojs/auth/providers/discord'
import EmailPassword from '@robojs/auth/providers/email-password'
// import ResendMailer from '@robojs/auth/emails/resend'
import { createPrismaAdapter } from '@robojs/auth'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { PrismaClient } from '@prisma-generated/client'
import type { AuthPluginOptions } from '@robojs/auth'

export const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL }) });

const adapter = createPrismaAdapter({ client: prisma, secret: process.env.AUTH_SECRET })

const config: AuthPluginOptions = {
  adapter: adapter,
  appName: 'Robo App',
  pages: {
    newUser: '/dashboard',
    signIn: '/login'
  },
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
  secret: process.env.AUTH_SECRET,
  cookies: {
    sessionToken: {
      name: `authjs.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false
      }
    }
  }
}

export default config
