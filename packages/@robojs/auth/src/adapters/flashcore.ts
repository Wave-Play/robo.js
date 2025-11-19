import { Flashcore } from 'robo.js'
import { nanoid } from 'nanoid'
import { hashToken } from '../utils/tokens.js'
import { authLogger } from '../utils/logger.js'
import { hashPassword, verifyPasswordHash } from '../utils/password-hash.js'
import type { AdapterAccount, AdapterSession, AdapterUser, VerificationToken } from '@auth/core/adapters'
import type { PasswordAdapter, PasswordRecord } from '../builtins/email-password/types.js'

/**
 * Configuration options for the Flashcore-backed Auth.js adapter.
 *
 * Provides the cryptographic secret required by {@link createFlashcoreAdapter}
 * to hash verification tokens, CSRF tokens, and session cookies. The secret
 * should be sourced from `AUTH_SECRET` or `NEXTAUTH_SECRET` environment
 * variables and must be at least 32 characters for production usage.
 *
 * ⚠️ Security: Never commit secrets to version control. Load them from your
 * deployment platform's secret manager or environment variables instead.
 *
 * @example
 * ```ts
 * const adapter = createFlashcoreAdapter({ secret: process.env.AUTH_SECRET! })
 * ```
 *
 * @example
 * ```ts
 * const adapter = createFlashcoreAdapter({
 * 	secret: crypto.randomBytes(32).toString('base64')
 * })
 * ```
 */
interface FlashcoreAdapterOptions {
	/** Secret used for hashing verification tokens. */
	secret: string
}

/**
 * Flashcore namespaces for isolating auth data and preventing key collisions.
 *
 * - `NS_USERS`: User records keyed by ID.
 * - `NS_USERS_BY_EMAIL`: Email → userId index for fast lookups.
 * - `NS_ACCOUNTS_ROOT`: Root namespace for OAuth account records.
 * - `NS_USER_ACCOUNTS`: User → accounts index for reverse lookups.
 * - `NS_SESSIONS`: Session records keyed by token.
 * - `NS_VERIFICATION`: Verification tokens (hashed) for email/OTP flows.
 * - `NS_USERS_INDEX`: Paginated index of user IDs.
 * - `NS_PASSWORD`: Password records keyed by userId.
 * - `NS_PASSWORD_EMAIL`: Legacy email → userId index for password users.
 */
const NS_USERS = ['auth', 'users']
const NS_USERS_BY_EMAIL = ['auth', 'usersByEmail']
const NS_ACCOUNTS_ROOT = ['auth', 'accounts']
const NS_USER_ACCOUNTS = ['auth', 'userAccounts']
const NS_SESSIONS = ['auth', 'sessions']
const NS_VERIFICATION = ['auth', 'verification']
const NS_USERS_INDEX = ['auth', 'usersIndex']
const NS_PASSWORD = ['auth', 'password']
const NS_PASSWORD_EMAIL = ['auth', 'passwordUserByEmail']

/** Generates the Flashcore key for a user record (identity function). */
const userKey = (id: string) => id
/** Generates the key for the email → userId index (lowercase normalized). */
const userEmailKey = (email: string) => email.toLowerCase()
/** Namespaces OAuth accounts by provider (e.g., google, discord). */
const accountNamespace = (provider: string) => [...NS_ACCOUNTS_ROOT, provider]
/** Produces the namespace/key pair for an OAuth account lookup. */
const accountKey = (provider: string, providerAccountId: string) => ({
	ns: accountNamespace(provider),
	key: providerAccountId
})
/** Key for user → accounts reverse index. */
const userAccountsKey = (userId: string) => userId
/** Key for session lookup by token. */
const sessionKey = (token: string) => token
/** Key for hashed verification token lookup. */
const verificationKey = (hashedToken: string) => hashedToken
/** Key for password records by userId. */
const passwordKey = (userId: string) => userId
/** Key for password email → userId index (lowercase normalized). */
const passwordEmailKey = (email: string) => email.toLowerCase()

/**
 * Converts a date-like value (Date, ISO string, Unix timestamp) into a Date
 * instance. Throws when the input cannot be converted, ensuring downstream
 * adapters do not silently accept invalid values.
 *
 * @param value - Date, ISO string, or Unix timestamp.
 * @returns Date instance representing the provided value.
 * @throws {TypeError} If the value is not date-like.
 *
 * Internal helper for deserializing Flashcore records.
 */
function reviveDate(value: unknown): Date {
	if (value instanceof Date) return value
	if (typeof value === 'string' || typeof value === 'number') return new Date(value)
	throw new TypeError('Expected a date-like value')
}

type AccountRef = { provider: string; id: string }

/**
 * Loads OAuth account references linked to a user. Returns an empty array when
 * no accounts exist. Used internally by `getUserByAccount`, `linkAccount`, and
 * `deleteUser` to keep user/account relationships consistent. Internal helper;
 * not part of the public adapter API.
 *
 * @param userId - User identifier to fetch accounts for.
 * @returns Array of `{ provider, id }` references.
 */
async function loadUserAccounts(userId: string): Promise<AccountRef[]> {
	const stored = await Flashcore.get<AccountRef[] | null>(userAccountsKey(userId), { namespace: NS_USER_ACCOUNTS })
	return stored ?? []
}

/**
 * Persists OAuth account references for a user. Automatically deduplicates by
 * `provider + providerAccountId` and deletes the key entirely when the array is
 * empty to keep the namespace clean. Internal helper.
 *
 * @param userId - User identifier.
 * @param accounts - Array of account references.
 */
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

/**
 * Reads a password record for the given user. Returns `null` for OAuth-only
 * users who never set a password. Internal helper—password hashes are never
 * exposed outside adapter methods.
 */
async function readPasswordRecord(userId: string): Promise<PasswordRecord | null> {
	return Flashcore.get<PasswordRecord | null>(passwordKey(userId), { namespace: NS_PASSWORD })
}

/**
 * Writes a password record and maintains both userId and email indexes for
 * quick lookups. Internal helper to keep dual indexes consistent.
 */
async function writePasswordRecord(record: PasswordRecord): Promise<void> {
	await Flashcore.set(passwordKey(record.userId), record, { namespace: NS_PASSWORD })
	await Flashcore.set(passwordEmailKey(record.email), record.userId, { namespace: NS_PASSWORD_EMAIL })
}

/**
 * Deletes a password record and cleans up the legacy email index. Safe to call
 * even when no password exists. Internal helper invoked by delete user flows.
 */
async function deletePasswordRecord(userId: string): Promise<void> {
	const existing = await readPasswordRecord(userId)
	if (existing?.email) {
		await Flashcore.delete(passwordEmailKey(existing.email), { namespace: NS_PASSWORD_EMAIL })
	}
	await Flashcore.delete(passwordKey(userId), { namespace: NS_PASSWORD })
}

/**
 * Resolves a user ID by email address using both the main user index and the
 * legacy password index. Email addresses are normalized to lowercase for
 * case-insensitive matching. Internal helper that supports migrations from
 * legacy password stores.
 */
async function findPasswordUserIdByEmail(email: string): Promise<string | null> {
	const normalized = email.toLowerCase()
	const idFromUsers = await Flashcore.get<string | null>(userEmailKey(normalized), { namespace: NS_USERS_BY_EMAIL })
	if (idFromUsers) return idFromUsers
	const legacy = await Flashcore.get<string | null>(passwordEmailKey(normalized), { namespace: NS_PASSWORD_EMAIL })
	return legacy ?? null
}

/** Revives `session.expires` back to a Date object after Flashcore serialization. Internal helper for Auth.js session safety. */
function normalizeSession(session: AdapterSession): AdapterSession {
	return { ...session, expires: reviveDate(session.expires) }
}

/** Revives verification token expiry from string/number to Date for runtime safety checks. Internal helper. */
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
 * Retrieves a paginated list of user IDs from the Flashcore user index. This
 * helper is ideal for bulk operations, admin dashboards, or migrations where
 * you only need identifiers instead of full {@link AdapterUser} records.
 *
 * Each call reads the index metadata plus the requested page (2 Flashcore I/O
 * operations). Cache results if you query the same page repeatedly. The
 * default page size is {@link DEFAULT_INDEX_PAGE_SIZE} (500 users). Fetching
 * every page for large deployments may take noticeable time; prefer streaming
 * or background jobs.
 *
 * Edge cases:
 * - Out-of-range pages (negative or >= pageCount) return an empty `ids` array
 *   while still including pagination metadata so callers can clamp gracefully.
 * - The index may briefly become inconsistent during concurrent
 *   create/delete operations; refresh the page to recover.
 * - Deleted users might linger in the index until the next rebuild. Always
 *   verify user existence before applying destructive actions.
 *
 * @param page - Zero-based page index. Defaults to `0` (first page).
 * @returns Object containing `ids`, `page`, `pageCount`, and `total` user count.
 *
 * @example Iterate through every page
 * ```ts
 * let page = 0
 * while (true) {
 * 	const { ids, pageCount } = await listUserIds(page)
 * 	if (!ids.length) break
 * 	await processUsers(ids)
 * 	if (++page >= pageCount) break
 * }
 * ```
 *
 * @example Check if any users exist
 * ```ts
 * const { total } = await listUserIds()
 * if (total === 0) console.log('No users found')
 * ```
 *
 * @example Handle out-of-range access gracefully
 * ```ts
 * const { ids, pageCount } = await listUserIds(999)
 * if (ids.length === 0) {
 * 	console.log(`Page out of range. Max page index: ${pageCount - 1}`)
 * }
 * ```
 *
 * @see DEFAULT_INDEX_PAGE_SIZE for the default page size.
 * @see listUsers for fetching full user objects.
 * @see addUserToIndex for index maintenance.
 * @see removeUserFromIndex for cleanup logic.
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
 * Retrieves paginated {@link AdapterUser} records by loading IDs from
 * {@link listUserIds} and then fetching each user. This is more expensive than
 * `listUserIds` because it performs `2 + N` Flashcore reads (metadata + page +
 * N user documents) but returns all user fields (id, email, name, image,
 * emailVerified).
 *
 * Edge cases:
 * - Users deleted between the index read and fetching individual records are
 *   filtered out, so `users.length` may be less than the page size.
 * - Out-of-range pages return an empty `users` array with metadata so callers
 *   can clamp gracefully.
 * - Custom scripts might have created incomplete user objects; always null
 *   check optional fields before use.
 *
 * Performance tips:
 * - Default page size is {@link DEFAULT_INDEX_PAGE_SIZE}. Fetching all users in
 *   one go may take seconds on large datasets—consider caching (and
 *   invalidating on create/delete) or running background exports.
 * - Use `listUserIds` when only IDs are needed to reduce I/O.
 *
 * @param page - Zero-based page index. Defaults to `0`.
 * @returns Pagination metadata plus an array of {@link AdapterUser} records.
 *
 * @example Display a dashboard summary
 * ```ts
 * const { users, total } = await listUsers(0)
 * console.log(`Showing ${users.length} of ${total} users`)
 * ```
 *
 * @example Export every user
 * ```ts
 * const { pageCount } = await listUsers()
 * const allUsers: AdapterUser[] = []
 * for (let page = 0; page < pageCount; page++) {
 * 	const { users } = await listUsers(page)
 * 	allUsers.push(...users)
 * }
 * ```
 *
 * @example Filter verified users in memory
 * ```ts
 * const { users } = await listUsers()
 * const verified = users.filter((user) => user.emailVerified)
 * ```
 *
 * @see listUserIds for ID-only pagination.
 * @see AdapterUser from `@auth/core/adapters` for the returned shape.
 * @see PasswordAdapter.getUser for single-record lookups.
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
 * Creates a password-capable Auth.js adapter that stores users, accounts,
 * sessions, verification tokens, and password hashes inside Flashcore
 * namespaces. Supports the full {@link PasswordAdapter} contract including
 * helper utilities such as {@link listUserIds} and {@link listUsers} for admin
 * tooling.
 *
 * Security:
 * - ⚠️ Verification tokens are hashed with SHA-256 via {@link hashToken} before
 *   storage to prevent leakage if Flashcore is compromised.
 * - ⚠️ Passwords are hashed with {@link hashPassword} using Argon2id (4096 KiB
 *   memory, 3 passes) and verified via {@link verifyPasswordHash}. Plaintext
 *   passwords are never stored.
 * - ⚠️ Email addresses are normalized to lowercase before indexing to ensure
 *   case-insensitive lookups. Keep your application-side normalization in sync.
 *
 * Performance:
 * - Most adapter methods require 1–3 Flashcore operations. Consider caching
 *   session data for extremely high traffic deployments.
 * - User pagination defaults to 500 users per page; adjust downstream tooling
 *   or rebuild the index if different sizing is required.
 *
 * Edge cases:
 * - Concurrent user creation with the same email can produce duplicates;
 *   implement application-level locking if this is a concern.
 * - Deleting a user cascades removal of accounts, sessions, passwords, and
 *   pagination indexes—this is irreversible.
 * - `getSessionAndUser` prunes expired sessions on read, so concurrent requests
 *   might observe brief inconsistencies.
 *
 * @param options - Requires a `secret` for hashing tokens. Must match the
 * Auth.js config secret.
 * @returns PasswordAdapter implementation with Flashcore-backed persistence.
 *
 * @example Basic setup via environment variables
 * ```ts
 * const adapter = createFlashcoreAdapter({ secret: process.env.AUTH_SECRET! })
 * ```
 *
 * @example Integrate with Auth.js config
 * ```ts
 * export default {
 * 	adapter: createFlashcoreAdapter({ secret: process.env.AUTH_SECRET! }),
 * 	providers: [...]
 * }
 * ```
 *
 * @example Handle initialization errors
 * ```ts
 * try {
 * 	createFlashcoreAdapter({ secret: process.env.AUTH_SECRET! })
 * } catch (error) {
 * 	console.error('Adapter initialization failed', error)
 * }
 * ```
 *
 * @see PasswordAdapter in `src/builtins/email-password/types.ts`
 * @see hashPassword and verifyPasswordHash in `src/utils/password-hash.ts`
 */
export function createFlashcoreAdapter(options: FlashcoreAdapterOptions): PasswordAdapter {
	const { secret } = options

	if (!secret) {
		throw new Error('Flashcore adapter requires a secret to hash tokens. Provide AUTH_SECRET in your config.')
	}

	const adapter: PasswordAdapter = {
		async createUser(user) {
			// Creates a new user, seeds email + pagination indexes, and generates an ID when missing.
			// Email is optional to support OAuth providers that don't provide email addresses.
			// The email index (NS_USERS_BY_EMAIL) is only written when email is present.
			// Edge case: concurrent creation with the same email can create duplicates; guard upstream.
			const record: AdapterUser = {
				...user,
				id: user.id ?? nanoid(21),
				email: user.email ?? null,
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
			// Updates the canonical user record and repairs the email index if the address changed.
			// Edge case: index updates are eventually consistent during concurrent reads.
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
			// Deletes the user and cascades removal of accounts, sessions, passwords, and indexes.
			// ⚠️ Security: ensure proper authorization before invoking; this cannot be undone.
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
			// Fetches session + user, normalizes expiry, and cleans up stale sessions in one pass.
			// Expired sessions are deleted eagerly to reduce subsequent lookups.
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
			// Stores hashed verification tokens so raw values never touch persistent storage.
			// ⚠️ Security: hashing uses SHA-256 with the adapter secret as the key derivation material.
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
			// Consumes a verification token exactly once. Deletes before expiry check to avoid races.
			// Edge case: expired tokens return null even though the record briefly existed.
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
			// Creates or replaces a password record using Argon2id with default parameters.
			// ⚠️ Security: plaintext passwords are never stored; hashes use 4096 KiB / 3 passes.
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
			// Verifies a password using timing-safe comparison. Returns false for OAuth-only users.
			// ⚠️ Security: relies on verifyPasswordHash which uses constant-time comparison.
			const record = await readPasswordRecord(userId)
			if (!record) return false
			return verifyPasswordHash(password, record.hash)
		},

		async deleteUserPassword(userId) {
			await deletePasswordRecord(userId)
		},

		async resetUserPassword({ userId, password }) {
			// Replaces the stored hash with a new Argon2id hash and updates timestamps for auditing.
			// Edge case: returns null for OAuth-only users without password records.
			const existing = await readPasswordRecord(userId)
			if (!existing) return null
			const hash = await hashPassword(password)
			const updated: PasswordRecord = { ...existing, hash, updatedAt: new Date().toISOString() }
			await writePasswordRecord(updated)
			return updated
		}
	}

	return adapter
}

export type { FlashcoreAdapterOptions }
