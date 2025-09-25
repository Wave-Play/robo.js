import { nanoid } from 'nanoid'
import { Flashcore } from 'robo.js'
import type { PasswordResetToken } from './types.js'
import { authLogger } from '../../utils/logger.js'

const NS_PASSWORD_RESET = 'auth_passwordReset'
const RESET_TOKEN_KEY = (token: string) => token

export async function createResetToken(userId: string, ttlMinutes = 30): Promise<PasswordResetToken> {
  const token = nanoid(32)
  const expires = new Date(Date.now() + ttlMinutes * 60 * 1000)
  await Flashcore.set(RESET_TOKEN_KEY(token), { userId, expires }, { namespace: NS_PASSWORD_RESET })
  return { token, userId, expires }
}

export async function useResetToken(token: string): Promise<PasswordResetToken | null> {
  const record = await Flashcore.get<{ userId: string; expires: string | Date } | null>(RESET_TOKEN_KEY(token), {
    namespace: NS_PASSWORD_RESET,
  })
  if (!record) return null
  await Flashcore.delete(RESET_TOKEN_KEY(token), { namespace: NS_PASSWORD_RESET })
  const expires = record.expires instanceof Date ? record.expires : new Date(record.expires)
  if (expires < new Date()) {
    authLogger.debug('Ignoring expired password reset token')
    return null
  }
  return { token, userId: record.userId, expires }
}

