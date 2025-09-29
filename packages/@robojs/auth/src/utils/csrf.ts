import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** Pair of CSRF token values used for cookie+payload validation. */
export interface CsrfTokenPair {
	cookie: string
	token: string
}

/** Generates a random CSRF token and its hashed cookie counterpart. */
export function createCsrfToken(secret: string, length = 32): CsrfTokenPair {
	const token = randomBytes(length).toString('hex')

	return { token, cookie: hashCsrfToken(token, secret) }
}

/** Hashes a CSRF token with the configured secret for secure cookie storage. */
export function hashCsrfToken(token: string, secret: string): string {
	return createHash('sha256').update(`${token}${secret}`).digest('hex')
}

/** Compares a request token against the cookie value using a timing-safe check. */
export function verifyCsrfToken(token: string, cookie: string, secret: string): boolean {
	const expected = hashCsrfToken(token, secret)
	const a = Buffer.from(expected, 'hex')
	const b = Buffer.from(cookie, 'hex')
	// Timing-safe comparison prevents leaking how many hex characters matched.

	return a.length === b.length && timingSafeEqual(a, b)
}
