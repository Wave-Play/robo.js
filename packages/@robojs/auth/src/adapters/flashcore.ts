import { Flashcore } from 'robo.js'
import { nanoid } from 'nanoid'
import { hashToken } from '../utils/tokens.js'
import { authLogger } from '../utils/logger.js'
import { hashPassword, verifyPasswordHash } from '../utils/password-hash.js'
import type { AdapterAccount, AdapterSession, AdapterUser, VerificationToken } from '@auth/core/adapters'
import type { PasswordAdapter, PasswordRecord, PasswordResetToken } from '../builtins/email-password/types.js'

/** Options required to initialize the Flashcore-backed Auth adapter. */
interface FlashcoreAdapterOptions {
	secret: string
}

const NS_USERS = ['auth', 'users']
const NS_USERS_BY_EMAIL = ['auth', 'usersByEmail']
const NS_ACCOUNTS_ROOT = ['auth', 'accounts']
const NS_USER_ACCOUNTS = ['auth', 'userAccounts']
const NS_SESSIONS = ['auth', 'sessions']
const NS_VERIFICATION = ['auth', 'verification']
const NS_USERS_INDEX = ['auth', 'usersIndex']
const NS_PASSWORD = ['auth', 'password']
const NS_PASSWORD_EMAIL = ['auth', 'passwordUserByEmail']
const NS_PASSWORD_RESET = ['auth', 'passwordReset']

const userKey = (id: string) => id
const userEmailKey = (email: string) => email.toLowerCase()
const accountNamespace = (provider: string) => [...NS_ACCOUNTS_ROOT, provider]
const accountKey = (provider: string, providerAccountId: string) => ({
	ns: accountNamespace(provider),
	key: providerAccountId
})
const userAccountsKey = (userId: string) => userId
const sessionKey = (token: string) => token
const verificationKey = (hashedToken: string) => hashedToken
const passwordKey = (userId: string) => userId
const passwordEmailKey = (email: string) => email.toLowerCase()
const passwordResetKey = (token: string) => token

const DEFAULT_RESET_TOKEN_TTL_MINUTES = 30

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

async function readPasswordRecord(userId: string): Promise<PasswordRecord | null> {
	return Flashcore.get<PasswordRecord | null>(passwordKey(userId), { namespace: NS_PASSWORD })
}

async function writePasswordRecord(record: PasswordRecord): Promise<void> {
	await Flashcore.set(passwordKey(record.userId), record, { namespace: NS_PASSWORD })
	await Flashcore.set(passwordEmailKey(record.email), record.userId, { namespace: NS_PASSWORD_EMAIL })
}

async function deletePasswordRecord(userId: string): Promise<void> {
	const existing = await readPasswordRecord(userId)
	if (existing?.email) {
		await Flashcore.delete(passwordEmailKey(existing.email), { namespace: NS_PASSWORD_EMAIL })
	}
	await Flashcore.delete(passwordKey(userId), { namespace: NS_PASSWORD })
}

async function findPasswordUserIdByEmail(email: string): Promise<string | null> {
	const normalized = email.toLowerCase()
	const idFromUsers = await Flashcore.get<string | null>(userEmailKey(normalized), { namespace: NS_USERS_BY_EMAIL })
	if (idFromUsers) return idFromUsers
	const legacy = await Flashcore.get<string | null>(passwordEmailKey(normalized), { namespace: NS_PASSWORD_EMAIL })
	return legacy ?? null
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

interface UsersIndexMeta {
	pageSize: number
	pageCount: number
	total: number
}

const DEFAULT_INDEX_PAGE_SIZE = 500

async function loadUsersIndexMeta(): Promise<UsersIndexMeta> {
	const meta = await Flashcore.get<UsersIndexMeta | null>('meta', { namespace: NS_USERS_INDEX })
	if (meta && typeof meta.pageSize === 'number') return meta
	const initial: UsersIndexMeta = { pageSize: DEFAULT_INDEX_PAGE_SIZE, pageCount: 0, total: 0 }
	await Flashcore.set('meta', initial, { namespace: NS_USERS_INDEX })
	return initial
}

async function saveUsersIndexMeta(meta: UsersIndexMeta): Promise<void> {
	await Flashcore.set('meta', meta, { namespace: NS_USERS_INDEX })
}

function pageKey(n: number): string {
	return `page:${n}`
}

async function readUsersIndexPage(n: number): Promise<string[]> {
	return (await Flashcore.get<string[] | null>(pageKey(n), { namespace: NS_USERS_INDEX })) ?? []
}

async function writeUsersIndexPage(n: number, ids: string[]): Promise<void> {
	await Flashcore.set(pageKey(n), ids, { namespace: NS_USERS_INDEX })
}

async function addUserToIndex(userId: string): Promise<void> {
	const meta = await loadUsersIndexMeta()
	// Ensure at least one page exists
	if (meta.pageCount === 0) meta.pageCount = 1
	const lastPage = meta.pageCount - 1
	let ids = await readUsersIndexPage(lastPage)
	if (ids.length >= meta.pageSize) {
		// Start a new page
		await writeUsersIndexPage(lastPage, ids)
		meta.pageCount += 1
		ids = []
	}
	// Avoid duplicates when reindexing from multiple call sites.
	if (!ids.includes(userId)) ids.push(userId)
	await writeUsersIndexPage(meta.pageCount - 1, ids)
	meta.total += 1
	await saveUsersIndexMeta(meta)
}

async function removeUserFromIndex(userId: string): Promise<void> {
	const meta = await loadUsersIndexMeta()
	if (meta.pageCount === 0 || meta.total === 0) return
	for (let i = 0; i < meta.pageCount; i++) {
		const ids = await readUsersIndexPage(i)
		const idx = ids.indexOf(userId)
		if (idx !== -1) {
			ids.splice(idx, 1)
			if (ids.length === 0 && i === meta.pageCount - 1) {
				await Flashcore.delete(pageKey(i), { namespace: NS_USERS_INDEX })
				meta.pageCount = Math.max(0, meta.pageCount - 1)
			} else {
				await writeUsersIndexPage(i, ids)
			}
			meta.total = Math.max(0, meta.total - 1)
			await saveUsersIndexMeta(meta)
			return
		}
	}
}

/**
 * Returns a paginated list of Auth.js user identifiers stored in Flashcore.
 *
 * @param page - Zero-based page index; defaults to the first page.
 * @returns Summary object containing IDs plus paging metadata.
 *
 * @example
 * ```ts
 * const { ids } = await listUserIds()
 * ```
 *
 * @example
 * ```ts
 * const page = await listUserIds(1)
 * console.log(page.total)
 * ```
 */
export async function listUserIds(
	page = 0
): Promise<{ ids: string[]; page: number; pageCount: number; total: number }> {
	const meta = await loadUsersIndexMeta()
	if (page < 0 || page >= meta.pageCount) {
		// Out-of-range pages return metadata so callers can clamp gracefully.
		return { ids: [], page, pageCount: meta.pageCount, total: meta.total }
	}

	const ids = await readUsersIndexPage(page)

	return { ids, page, pageCount: meta.pageCount, total: meta.total }
}

/**
 * Reads full Auth.js user records backed by Flashcore.
 *
 * @param page - Zero-based page index; defaults to the first page.
 * @returns List of users alongside pagination metadata.
 *
 * @example
 * ```ts
 * const { users } = await listUsers(2)
 * ```
 *
 * @example
 * ```ts
 * const { users, pageCount } = await listUsers()
 * if (pageCount > 1) console.log('paginate')
 * ```
 */
export async function listUsers(
	page = 0
): Promise<{ users: AdapterUser[]; page: number; pageCount: number; total: number }> {
	const { ids, page: p, pageCount, total } = await listUserIds(page)
	const users = await Promise.all(
		// Fetch each user lazily; gaps may occur if records were deleted mid-query.
		ids.map((id) => Flashcore.get<AdapterUser | null>(userKey(id), { namespace: NS_USERS }))
	)

	return { users: users.filter(Boolean) as AdapterUser[], page: p, pageCount, total }
}

/**
 * Creates an Auth.js adapter backed by Flashcore storage.
 *
 * @param options - Requires a `secret` used for hashing tokens and verification records.
 * @returns A password-aware Auth.js adapter instance.
 *
 * @example
 * ```ts
 * const adapter = createFlashcoreAdapter({ secret: process.env.AUTH_SECRET! })
 * ```
 */
export function createFlashcoreAdapter(options: FlashcoreAdapterOptions): PasswordAdapter {
	const { secret } = options

	if (!secret) {
		throw new Error('Flashcore adapter requires a secret to hash tokens. Provide AUTH_SECRET in your config.')
	}

	const adapter: PasswordAdapter = {
		async createUser(user) {
			// Persist the user and maintain secondary indexes for email and pagination.
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
			await addUserToIndex(record.id)

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

		async findUserIdByEmail(email) {
			return findPasswordUserIdByEmail(email)
		},

		async getUserByAccount(identifier) {
			// Accounts are namespaced by provider so we can look up the owning user id quickly.
			const key = accountKey(identifier.provider, identifier.providerAccountId)
			const account = await Flashcore.get<AdapterAccount | null>(key.key, { namespace: key.ns })
			if (!account) return null
			const user = await Flashcore.get<AdapterUser | null>(userKey(account.userId), { namespace: NS_USERS })

			return user ?? null
		},

		async updateUser(user) {
			// Keep the user record canonical and repair email indexes when addresses change.
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
				// Remove reverse email lookup so future sign-ins do not resolve to stale ids.
				await Flashcore.delete(userEmailKey(user.email), { namespace: NS_USERS_BY_EMAIL })
			}

			const accountRefs = await loadUserAccounts(id)
			await Promise.all(
				// Tear down provider account pointers for every linked provider.
				accountRefs.map((ref) => Flashcore.delete(ref.id, { namespace: accountNamespace(ref.provider) }))
			)
			await Flashcore.delete(userAccountsKey(id), { namespace: NS_USER_ACCOUNTS })
			await deletePasswordRecord(id)
			await Flashcore.delete(userKey(id), { namespace: NS_USERS })
			await removeUserFromIndex(id)
		},

		async linkAccount(account) {
			// Record the provider account and update the per-user account index.
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
			// Sessions are keyed by token so Auth.js can fetch them on every request.
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
			// Merge with the existing record before writing to preserve expires timestamps.
			const existing = await Flashcore.get<AdapterSession | null>(sessionKey(session.sessionToken), {
				namespace: NS_SESSIONS
			})
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
			// Store hashed tokens to avoid leaking the raw value at rest.
			const hashed = hashToken(token.token, secret)
			await Flashcore.set(
				verificationKey(hashed),
				{
					identifier: token.identifier,
					expires: token.expires
				},
				{ namespace: NS_VERIFICATION }
			)
			return token
		},

		async useVerificationToken(params) {
			const hashed = hashToken(params.token, secret)
			const stored = await Flashcore.get<{ identifier: string; expires: unknown } | null>(verificationKey(hashed), {
				namespace: NS_VERIFICATION
			})
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

		async createUserPassword({ userId, email, password }) {
			const normalizedEmail = email.toLowerCase()
			const existing = await readPasswordRecord(userId)
			const now = new Date().toISOString()
			const hash = await hashPassword(password)
			const record: PasswordRecord = existing
				? { ...existing, email: normalizedEmail, hash, updatedAt: now }
				: {
						id: nanoid(16),
						email: normalizedEmail,
						hash,
						userId,
						createdAt: now,
						updatedAt: now
					}
			if (existing?.email && existing.email !== normalizedEmail) {
				await Flashcore.delete(passwordEmailKey(existing.email), { namespace: NS_PASSWORD_EMAIL })
			}
			await writePasswordRecord(record)
			return record
		},

		async verifyUserPassword({ userId, password }) {
			const record = await readPasswordRecord(userId)
			if (!record) return false
			return verifyPasswordHash(password, record.hash)
		},

		async deleteUserPassword(userId) {
			await deletePasswordRecord(userId)
		},

		async resetUserPassword({ userId, password }) {
			const existing = await readPasswordRecord(userId)
			if (!existing) return null
			const hash = await hashPassword(password)
			const updated: PasswordRecord = { ...existing, hash, updatedAt: new Date().toISOString() }
			await writePasswordRecord(updated)
			return updated
		},

		async createPasswordResetToken(userId, ttlMinutes = DEFAULT_RESET_TOKEN_TTL_MINUTES) {
			const token = nanoid(32)
			const expires = new Date(Date.now() + ttlMinutes * 60 * 1000)
			await Flashcore.set(passwordResetKey(token), { userId, expires }, { namespace: NS_PASSWORD_RESET })
			return { token, userId, expires }
		},

		async usePasswordResetToken(token) {
			const stored = await Flashcore.get<{ userId: string; expires: string | Date } | null>(passwordResetKey(token), {
				namespace: NS_PASSWORD_RESET
			})
			if (!stored) return null
			await Flashcore.delete(passwordResetKey(token), { namespace: NS_PASSWORD_RESET })
			const expires = stored.expires instanceof Date ? stored.expires : new Date(stored.expires)
			if (expires <= new Date()) {
				authLogger.debug('Ignoring expired password reset token')
				return null
			}
			return { token, userId: stored.userId, expires } satisfies PasswordResetToken
		}
	}

	return adapter
}

export type { FlashcoreAdapterOptions }
