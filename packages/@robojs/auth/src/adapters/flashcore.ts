import { Flashcore } from 'robo.js'
import { nanoid } from 'nanoid'
import { hashToken } from '../utils/tokens.js'
import { authLogger } from '../utils/logger.js'
import type {
	Adapter,
	AdapterAccount,
	AdapterSession,
	AdapterUser,
	VerificationToken
} from '@auth/core/adapters'

interface FlashcoreAdapterOptions {
	secret: string
}

const userKey = (id: string) => `auth:users:${id}`
const userEmailKey = (email: string) => `auth:usersByEmail:${email.toLowerCase()}`
const accountKey = (provider: string, providerAccountId: string) =>
	`auth:accounts:${provider}:${providerAccountId}`
const userAccountsKey = (userId: string) => `auth:userAccounts:${userId}`
const sessionKey = (token: string) => `auth:sessions:${token}`
const verificationKey = (hashedToken: string) => `auth:verification:${hashedToken}`

function reviveDate(value: unknown): Date {
	if (value instanceof Date) return value
	if (typeof value === 'string' || typeof value === 'number') return new Date(value)
	throw new TypeError('Expected a date-like value')
}

async function loadUserAccounts(userId: string): Promise<string[]> {
	const stored = await Flashcore.get<string[] | null>(userAccountsKey(userId))
	return stored ?? []
}

async function storeUserAccounts(userId: string, accounts: string[]): Promise<void> {
	if (!accounts.length) {
		await Flashcore.delete(userAccountsKey(userId))
		return
	}
	await Flashcore.set(userAccountsKey(userId), Array.from(new Set(accounts)))
}

function normalizeSession(session: AdapterSession): AdapterSession {
	return { ...session, expires: reviveDate(session.expires) }
}

function normalizeVerificationRecord(record: { identifier: string; expires: unknown }): {
	identifier: string
	expires: Date
} {
	return { identifier: record.identifier, expires: reviveDate(record.expires) }
}

/**
 * Creates an Auth.js adapter backed by Flashcore storage.
 *
 * @example
 * ```ts
 * import { createFlashcoreAdapter } from '@robojs/auth'
 *
 * const adapter = createFlashcoreAdapter({ secret: process.env.AUTH_SECRET! })
 * ```
 */
export function createFlashcoreAdapter(options: FlashcoreAdapterOptions): Adapter {
	const { secret } = options

	if (!secret) {
		throw new Error('Flashcore adapter requires a secret to hash tokens. Provide AUTH_SECRET in your config.')
	}

	const adapter: Adapter = {
		async createUser(user) {
			if (!user.email) {
				throw new Error('AdapterUser.email is required when creating a user')
			}
			const record: AdapterUser = {
				...user,
				id: user.id ?? nanoid(21),
				email: user.email,
				emailVerified: user.emailVerified ?? null
			}
			await Flashcore.set(userKey(record.id), record)
			if (record.email) {
				await Flashcore.set(userEmailKey(record.email), record.id)
			}
			return record
		},

		async getUser(id) {
			const user = await Flashcore.get<AdapterUser | null>(userKey(id))
			return user ?? null
		},

		async getUserByEmail(email) {
			const id = await Flashcore.get<string | null>(userEmailKey(email))
			if (!id) return null
			const user = await Flashcore.get<AdapterUser | null>(userKey(id))
			return user ?? null
		},

		async getUserByAccount(identifier) {
			const key = accountKey(identifier.provider, identifier.providerAccountId)
			const account = await Flashcore.get<AdapterAccount | null>(key)
			if (!account) return null
			const user = await Flashcore.get<AdapterUser | null>(userKey(account.userId))
			return user ?? null
		},

		async updateUser(user) {
			const existing = await Flashcore.get<AdapterUser | null>(userKey(user.id))
			if (!existing) {
				throw new Error(`User ${user.id} does not exist`)
			}
			const updated: AdapterUser = { ...existing, ...user }
			await Flashcore.set(userKey(updated.id), updated)
			if (existing.email && existing.email !== updated.email) {
				await Flashcore.delete(userEmailKey(existing.email))
			}
			if (updated.email) {
				await Flashcore.set(userEmailKey(updated.email), updated.id)
			}
			return updated
		},

		async deleteUser(id) {
			const user = await Flashcore.get<AdapterUser | null>(userKey(id))
			if (!user) return

			if (user.email) {
				await Flashcore.delete(userEmailKey(user.email))
			}

			const accountKeys = await loadUserAccounts(id)
			await Promise.all(accountKeys.map((key) => Flashcore.delete(key)))
			await Flashcore.delete(userAccountsKey(id))
			await Flashcore.delete(userKey(id))
		},

		async linkAccount(account) {
			const key = accountKey(account.provider, account.providerAccountId)
			await Flashcore.set<AdapterAccount>(key, account)
			const accounts = await loadUserAccounts(account.userId)
			accounts.push(key)
			await storeUserAccounts(account.userId, accounts)
			return account
		},

		async unlinkAccount(identifier) {
			const key = accountKey(identifier.provider, identifier.providerAccountId)
			const account = await Flashcore.get<AdapterAccount | null>(key)
			if (!account) return undefined
			await Flashcore.delete(key)
			const accounts = await loadUserAccounts(account.userId)
			await storeUserAccounts(
				account.userId,
				accounts.filter((value) => value !== key)
			)
			return account
		},

		async createSession(session) {
			await Flashcore.set(sessionKey(session.sessionToken), session)
			return session
		},

		async getSessionAndUser(sessionToken) {
			const stored = await Flashcore.get<AdapterSession | null>(sessionKey(sessionToken))
			if (!stored) return null
			const normalized = normalizeSession(stored)
			if (normalized.expires <= new Date()) {
				await Flashcore.delete(sessionKey(sessionToken))
				return null
			}
			const user = await Flashcore.get<AdapterUser | null>(userKey(normalized.userId))
			if (!user) {
				await Flashcore.delete(sessionKey(sessionToken))
				return null
			}
			return { session: normalized, user }
		},

		async updateSession(session) {
			const existing = await Flashcore.get<AdapterSession | null>(sessionKey(session.sessionToken))
			if (!existing) return null
			const merged = normalizeSession({ ...existing, ...session })
			await Flashcore.set(sessionKey(merged.sessionToken), merged)
			return merged
		},

		async deleteSession(sessionToken) {
			const existing = await Flashcore.get<AdapterSession | null>(sessionKey(sessionToken))
			if (!existing) return null
			await Flashcore.delete(sessionKey(sessionToken))
			return normalizeSession(existing)
		},

		async createVerificationToken(token) {
			const hashed = hashToken(token.token, secret)
			await Flashcore.set(verificationKey(hashed), {
				identifier: token.identifier,
				expires: token.expires
			})
			return token
		},

		async useVerificationToken(params) {
			const hashed = hashToken(params.token, secret)
			const stored = await Flashcore.get<{ identifier: string; expires: unknown } | null>(verificationKey(hashed))
			if (!stored) {
				return null
			}

			await Flashcore.delete(verificationKey(hashed))

			const normalized = normalizeVerificationRecord(stored)
			if (normalized.expires <= new Date()) {
				authLogger.debug('Verification token expired for', normalized.identifier)
				return null
			}

			return {
				identifier: normalized.identifier,
				expires: normalized.expires,
				token: params.token
			} satisfies VerificationToken
		},

	}

	return adapter
}

export type { FlashcoreAdapterOptions }
