import CredentialsProvider from '@auth/core/providers/credentials'
import { authLogger } from '../../utils/logger.js'
import type { EmailPasswordProviderOptions } from './types.js'

type ProviderLike = ReturnType<typeof CredentialsProvider>

function createProvider(options: EmailPasswordProviderOptions): ProviderLike {
  const { adapter, name = 'Email & Password' } = options
  return CredentialsProvider({
    name,
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    authorize: async (credentials: Record<string, unknown> | undefined) => {
      authLogger.debug('Authorizing credentials login', {
        email: credentials?.email,
        password: credentials?.password ? '****' : undefined,
      })
      const email = String(credentials?.email ?? '').toLowerCase()
      const password = String(credentials?.password ?? '')
      if (!email || !password) {
        authLogger.warn('Missing email or password in credentials')
        return null
      }

      const userId = await adapter.findUserIdByEmail(email)
      if (!userId) {
        authLogger.debug(`No user found for email ${email}`)
        return null
      }

      const isValid = await adapter.verifyUserPassword({ userId, password })
      if (!isValid) {
        authLogger.debug(`Invalid password attempt for ${email}`)
        return null
      }

      return adapter.getUser ? adapter.getUser(userId) : null
    },
  }) as ProviderLike
}

export default function EmailPasswordProvider(options: EmailPasswordProviderOptions): ProviderLike {
  return createProvider(options)
}

export { createResetToken, useResetToken } from './reset.js'
export type { PasswordRecord, PasswordResetToken } from './types.js'
