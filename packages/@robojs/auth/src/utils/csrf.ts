import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export interface CsrfTokenPair {
	cookie: string
	token: string
}

export function createCsrfToken(secret: string, length = 32): CsrfTokenPair {
	const token = randomBytes(length).toString('hex')
	return { token, cookie: hashCsrfToken(token, secret) }
}

export function hashCsrfToken(token: string, secret: string): string {
	return createHash('sha256').update(`${token}${secret}`).digest('hex')
}

export function verifyCsrfToken(token: string, cookie: string, secret: string): boolean {
	const expected = hashCsrfToken(token, secret)
	const a = Buffer.from(expected, 'hex')
	const b = Buffer.from(cookie, 'hex')
	return a.length === b.length && timingSafeEqual(a, b)
}
