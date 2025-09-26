import type { PasswordAdapter, PasswordResetToken } from './types.js'
import { assertPasswordAdapter } from './types.js'

/**
 * @deprecated Prefer calling adapter.createPasswordResetToken directly.
 */
export async function createResetToken(
	adapter: PasswordAdapter | import('@auth/core/adapters').Adapter,
	userId: string,
	ttlMinutes = 30
): Promise<PasswordResetToken> {
	assertPasswordAdapter(adapter)
	return adapter.createPasswordResetToken(userId, ttlMinutes)
}

/**
 * @deprecated Prefer calling adapter.usePasswordResetToken directly.
 */
export async function useResetToken(
	adapter: PasswordAdapter | import('@auth/core/adapters').Adapter,
	token: string
): Promise<PasswordResetToken | null> {
	assertPasswordAdapter(adapter)
	return adapter.usePasswordResetToken(token)
}
