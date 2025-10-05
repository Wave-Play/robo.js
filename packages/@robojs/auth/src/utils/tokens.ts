import { createHash, randomBytes } from 'node:crypto'
import type { Account } from '@auth/core/types'

/** Generates a random hex token suitable for email verification flows. */
export function generateToken(bytes = 32): string {
	return randomBytes(bytes).toString('hex')
}

/** Produces a deterministic SHA-256 hash for storing verification tokens. */
export function hashToken(token: string, secret: string): string {
	return createHash('sha256').update(`${token}${secret}`).digest('hex')
}

/** Checks if the upstream provider access token is already expired. */
export function isAccessTokenExpired(account: Pick<Account, 'expires_at' | 'expires_in'> | null | undefined): boolean {
	if (!account) return true
	const expiresAt = account.expires_at ?? (account.expires_in ? Date.now() / 1000 + account.expires_in : undefined)
	// Some providers only return relative expiry; calculate an absolute timestamp on the fly.
	if (!expiresAt) return false

	return expiresAt < Date.now() / 1000
}

/** Anticipates token expiry, optionally applying a buffer window before refreshing. */
export function shouldRefreshAccessToken(
	account: Pick<Account, 'expires_at' | 'expires_in'> | null | undefined,
	bufferSeconds = 60
): boolean {
	if (!account) return false
	const expiresAt = account.expires_at ?? (account.expires_in ? Date.now() / 1000 + account.expires_in : undefined)
	// Initiate refresh slightly early so API calls avoid authorization race conditions.
	if (!expiresAt) return false

	return expiresAt - bufferSeconds < Date.now() / 1000
}
