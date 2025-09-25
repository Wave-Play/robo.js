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

const NS_USERS = ['auth', 'users']
const NS_USERS_BY_EMAIL = ['auth', 'usersByEmail']
const NS_ACCOUNTS_ROOT = ['auth', 'accounts']
const NS_USER_ACCOUNTS = ['auth', 'userAccounts']
const NS_SESSIONS = ['auth', 'sessions']
const NS_VERIFICATION = ['auth', 'verification']

const userKey = (id: string) => id
const userEmailKey = (email: string) => email.toLowerCase()
const accountNamespace = (provider: string) => [...NS_ACCOUNTS_ROOT, provider]
const accountKey = (provider: string, providerAccountId: string) => ({
  ns: accountNamespace(provider),
  key: providerAccountId,
})
const userAccountsKey = (userId: string) => userId
const sessionKey = (token: string) => token
const verificationKey = (hashedToken: string) => hashedToken

function reviveDate(value: unknown): Date {
	if (value instanceof Date) return value
	if (typeof value === 'string' || typeof value === 'number') return new Date(value)
	throw new TypeError('Expected a date-like value')
}

type AccountRef = { provider: string; id: string }

async function loadUserAccounts(userId: string): Promise<AccountRef[]> {
	const stored = await Flashcore.get<AccountRef[] | null>(userAccountsKey(userId), { namespace: NS_USER_ACCOUNTS })
	return stored ?? []
}

async function storeUserAccounts(userId: string, accounts: AccountRef[]): Promise<void> {
	if (!accounts.length) {
		await Flashcore.delete(userAccountsKey(userId), { namespace: NS_USER_ACCOUNTS })
		return
	}
	// De-duplicate by provider+id
	const unique: AccountRef[] = []
	const seen = new Set<string>()
	for (const a of accounts) {
		const key = `${a.provider}\u0000${a.id}`
		if (!seen.has(key)) {
			seen.add(key)
			unique.push(a)
		}
	}
	await Flashcore.set(userAccountsKey(userId), unique, { namespace: NS_USER_ACCOUNTS })
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
			await Flashcore.set(userKey(record.id), record, { namespace: NS_USERS })
			if (record.email) {
				await Flashcore.set(userEmailKey(record.email), record.id, { namespace: NS_USERS_BY_EMAIL })
			}
			return record
		},

		async getUser(id) {
			const user = await Flashcore.get<AdapterUser | null>(userKey(id), { namespace: NS_USERS })
			return user ?? null
		},

		async getUserByEmail(email) {
			const id = await Flashcore.get<string | null>(userEmailKey(email), { namespace: NS_USERS_BY_EMAIL })
			if (!id) return null
			const user = await Flashcore.get<AdapterUser | null>(userKey(id), { namespace: NS_USERS })
			return user ?? null
		},

		async getUserByAccount(identifier) {
			const key = accountKey(identifier.provider, identifier.providerAccountId)
			const account = await Flashcore.get<AdapterAccount | null>(key.key, { namespace: key.ns })
			if (!account) return null
			const user = await Flashcore.get<AdapterUser | null>(userKey(account.userId), { namespace: NS_USERS })
			return user ?? null
		},

		async updateUser(user) {
			const existing = await Flashcore.get<AdapterUser | null>(userKey(user.id), { namespace: NS_USERS })
			if (!existing) {
				throw new Error(`User ${user.id} does not exist`)
			}
			const updated: AdapterUser = { ...existing, ...user }
			await Flashcore.set(userKey(updated.id), updated, { namespace: NS_USERS })
			if (existing.email && existing.email !== updated.email) {
				await Flashcore.delete(userEmailKey(existing.email), { namespace: NS_USERS_BY_EMAIL })
			}
			if (updated.email) {
				await Flashcore.set(userEmailKey(updated.email), updated.id, { namespace: NS_USERS_BY_EMAIL })
			}
			return updated
		},

		async deleteUser(id) {
			const user = await Flashcore.get<AdapterUser | null>(userKey(id), { namespace: NS_USERS })
			if (!user) return

			if (user.email) {
				await Flashcore.delete(userEmailKey(user.email), { namespace: NS_USERS_BY_EMAIL })
			}

			const accountRefs = await loadUserAccounts(id)
			await Promise.all(
				accountRefs.map((ref) =>
					Flashcore.delete(ref.id, { namespace: accountNamespace(ref.provider) })
				)
			)
			await Flashcore.delete(userAccountsKey(id), { namespace: NS_USER_ACCOUNTS })
			await Flashcore.delete(userKey(id), { namespace: NS_USERS })
		},

		async linkAccount(account) {
			const key = accountKey(account.provider, account.providerAccountId)
			await Flashcore.set<AdapterAccount>(key.key, account, { namespace: key.ns })
			const accounts = await loadUserAccounts(account.userId)
			const ref: AccountRef = { provider: account.provider, id: account.providerAccountId }
			const exists = accounts.some((a) => a.provider === ref.provider && a.id === ref.id)
			if (!exists) accounts.push(ref)
			await storeUserAccounts(account.userId, accounts)
			return account
		},

		async unlinkAccount(identifier) {
			const key = accountKey(identifier.provider, identifier.providerAccountId)
			const account = await Flashcore.get<AdapterAccount | null>(key.key, { namespace: key.ns })
			if (!account) return undefined
			await Flashcore.delete(key.key, { namespace: key.ns })
			const accounts = await loadUserAccounts(account.userId)
			await storeUserAccounts(
				account.userId,
				accounts.filter((a) => !(a.provider === identifier.provider && a.id === identifier.providerAccountId))
			)
			return account
		},

		async createSession(session) {
			await Flashcore.set(sessionKey(session.sessionToken), session, { namespace: NS_SESSIONS })
			return session
		},

		async getSessionAndUser(sessionToken) {
			const stored = await Flashcore.get<AdapterSession | null>(sessionKey(sessionToken), { namespace: NS_SESSIONS })
			if (!stored) return null
			const normalized = normalizeSession(stored)
			if (normalized.expires <= new Date()) {
				await Flashcore.delete(sessionKey(sessionToken), { namespace: NS_SESSIONS })
				return null
			}
			const user = await Flashcore.get<AdapterUser | null>(userKey(normalized.userId), { namespace: NS_USERS })
			if (!user) {
				await Flashcore.delete(sessionKey(sessionToken), { namespace: NS_SESSIONS })
				return null
			}
			return { session: normalized, user }
		},

		async updateSession(session) {
			const existing = await Flashcore.get<AdapterSession | null>(sessionKey(session.sessionToken), { namespace: NS_SESSIONS })
			if (!existing) return null
			const merged = normalizeSession({ ...existing, ...session })
			await Flashcore.set(sessionKey(merged.sessionToken), merged, { namespace: NS_SESSIONS })
			return merged
		},

		async deleteSession(sessionToken) {
			const existing = await Flashcore.get<AdapterSession | null>(sessionKey(sessionToken), { namespace: NS_SESSIONS })
			if (!existing) return null
			await Flashcore.delete(sessionKey(sessionToken), { namespace: NS_SESSIONS })
			return normalizeSession(existing)
		},

		async createVerificationToken(token) {
			const hashed = hashToken(token.token, secret)
			await Flashcore.set(verificationKey(hashed), {
				identifier: token.identifier,
				expires: token.expires
			}, { namespace: NS_VERIFICATION })
			return token
		},

		async useVerificationToken(params) {
			const hashed = hashToken(params.token, secret)
			const stored = await Flashcore.get<{ identifier: string; expires: unknown } | null>(verificationKey(hashed), { namespace: NS_VERIFICATION })
			if (!stored) {
				return null
			}

			await Flashcore.delete(verificationKey(hashed), { namespace: NS_VERIFICATION })

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
