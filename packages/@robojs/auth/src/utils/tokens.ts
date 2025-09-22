import { createHash, randomBytes } from 'node:crypto'
import type { Account } from '@auth/core/types'

export function generateToken(bytes = 32): string {
	return randomBytes(bytes).toString('hex')
}

export function hashToken(token: string, secret: string): string {
	return createHash('sha256').update(`${token}${secret}`).digest('hex')
}

export function isAccessTokenExpired(account: Pick<Account, 'expires_at' | 'expires_in'> | null | undefined): boolean {
	if (!account) return true
	const expiresAt = account.expires_at ?? (account.expires_in ? Date.now() / 1000 + account.expires_in : undefined)
	if (!expiresAt) return false
	return expiresAt < Date.now() / 1000
}

export function shouldRefreshAccessToken(
	account: Pick<Account, 'expires_at' | 'expires_in'> | null | undefined,
	bufferSeconds = 60
): boolean {
	if (!account) return false
	const expiresAt = account.expires_at ?? (account.expires_in ? Date.now() / 1000 + account.expires_in : undefined)
	if (!expiresAt) return false
	return expiresAt - bufferSeconds < Date.now() / 1000
}
