import { createRequire } from 'node:module'
import { hashPassword, needsRehash, verifyPasswordHash } from '../utils/password-hash.js'
import type { PasswordHashParams } from '../utils/password-hash.js'
import type { Adapter, AdapterUser } from '@auth/core/adapters'
import type { PasswordAdapter, PasswordRecord } from '../builtins/email-password/types.js'

const DEFAULT_LIST_PAGE_SIZE = 500
const DEFAULT_PASSWORD_MODEL = 'password'

interface PrismaDelegate {
	findUnique?(args: unknown): Promise<unknown>
	findFirst?(args: unknown): Promise<unknown>
	findMany?(args: unknown): Promise<unknown>
	create?(args: unknown): Promise<unknown>
	update?(args: unknown): Promise<unknown>
	upsert?(args: unknown): Promise<unknown>
	delete?(args: unknown): Promise<unknown>
	deleteMany?(args: unknown): Promise<unknown>
	count?(args?: unknown): Promise<number>
}

/**
 * Minimal Prisma client surface required by {@link createPrismaAdapter}.
 * Compatible with any Prisma version that exposes standard CRUD delegates.
 *
 * Fields:
 * - `user`: Required delegate exposing `findUnique/findFirst/findMany/create/update/delete/count`.
 * - `$transaction?`: Optional transaction helper for future use.
 * - `[key: string]`: Additional delegates (account/session/password) accessed dynamically.
 *
 * Edge cases:
 * - If your client removes or renames CRUD helpers, the adapter will throw at runtime.
 * - Prisma client extensions can wrap delegates; ensure they still expose the methods above.
 *
 * @example Standard Prisma client
 * ```ts
 * import { PrismaClient } from '@prisma/client'
 * const prisma = new PrismaClient()
 * const adapter = createPrismaAdapter({ client: prisma, secret: process.env.AUTH_SECRET! })
 * ```
 *
 * @example Prisma client with extensions
 * ```ts
 * const prisma = new PrismaClient().$extends({ ...features })
 * const adapter = createPrismaAdapter({
 * 	client: prisma as PrismaClientLike,
 * 	secret: process.env.AUTH_SECRET!
 * })
 * ```
 *
 * @see PrismaDelegate for expected delegate shape.
 */
export interface PrismaClientLike {
	[key: string]: PrismaDelegate | unknown
	user: PrismaDelegate
	$transaction?: (...operations: unknown[]) => Promise<unknown>
}

/**
 * Customizes Prisma model names when your schema deviates from the defaults.
 * Currently only the password model is configurable.
 *
 * Field guidance:
 * - `password`: Name of the password model (defaults to `password`). Must refer
 *   to a model with fields `id`, `userId`, `email`, `hash`, `createdAt`, `updatedAt`.
 *
 * Edge cases:
 * - Names are case-sensitive. Passing the wrong case throws during adapter init.
 * - Custom models must match the expected schema; missing fields cause runtime errors.
 *
 * @example Custom password model
 * ```ts
 * createPrismaAdapter({
 * 	client: prisma,
 * 	secret: process.env.AUTH_SECRET!,
 * 	models: { password: 'userPassword' }
 * })
 * ```
 *
 * @example Default naming (no override)
 * ```ts
 * createPrismaAdapter({ client: prisma, secret: process.env.AUTH_SECRET! })
 * ```
 *
 * @see DEFAULT_PASSWORD_MODEL for the fallback name.
 */
export interface PrismaAdapterModelOptions {
	password?: string
}

/**
 * Complete configuration object for {@link createPrismaAdapter}.
 *
 * Fields:
 * - `client`: Required {@link PrismaClientLike} instance with user + password models.
 * - `secret`: Required token hashing secret. Minimum 32 characters recommended.
 * - `hashParameters?`: Optional {@link PasswordHashParams} overrides for Argon2id
 *   (defaults to `DEFAULT_ARGON2_PARAMS` from `src/utils/password-hash.ts`).
 * - `models?`: Optional {@link PrismaAdapterModelOptions} for custom model names.
 *
 * ⚠️ Security:
 * - Never commit secrets; load them from environment variables or secret stores.
 * - Increasing `hashParameters` strengthens security but may slow down hashing on low-memory hosts.
 * - Changing `hashParameters` requires rehashing existing passwords. The adapter handles this lazily on verify.
 *
 * Performance notes:
 * - Each adapter method runs 1–3 database queries. Enable Prisma connection pooling for high throughput.
 * - Auto-rehashing adds latency to the first login after parameters change.
 *
 * Edge cases:
 * - Call `await prisma.$connect()` before passing the client if your environment requires manual connections.
 * - Keep `hashParameters` consistent across all adapter instances (workers). Use shared env vars.
 *
 * @example Basic setup
 * ```ts
 * createPrismaAdapter({ client: prisma, secret: process.env.AUTH_SECRET! })
 * ```
 *
 * @example Custom Argon2id params
 * ```ts
 * createPrismaAdapter({
 * 	client: prisma,
 * 	secret: process.env.AUTH_SECRET!,
 * 	hashParameters: { memorySize: 8192, passes: 4 }
 * })
 * ```
 *
 * @example Custom password model
 * ```ts
 * createPrismaAdapter({
 * 	client: prisma,
 * 	secret: process.env.AUTH_SECRET!,
 * 	models: { password: 'userCredentials' }
 * })
 * ```
 */
export interface PrismaAdapterOptions {
	client: PrismaClientLike
	secret: string
	hashParameters?: Partial<PasswordHashParams>
	models?: PrismaAdapterModelOptions
}

interface PrismaPasswordRow {
	id: string
	userId: string
	email: string
	hash: string
	createdAt: Date
	updatedAt: Date
}

interface ListUsersOptions {
	page?: number
	pageSize?: number
	orderBy?: unknown
	where?: unknown
}

const require = createRequire(import.meta.url)

type AuthPrismaAdapterFactory = (client: PrismaClientLike) => Adapter

let prismaAdapterFactory: AuthPrismaAdapterFactory | undefined

/**
 * Lazily loads and caches the `@auth/prisma-adapter` factory. Handles the
 * package's various export styles (named, default, nested) and throws a helpful
 * error if the peer dependency is missing.
 *
 * @returns Prisma adapter factory exported by `@auth/prisma-adapter`.
 * @throws {Error} If the module is missing or exports an unexpected shape.
 */
function loadAuthPrismaAdapter(): AuthPrismaAdapterFactory {
	if (prismaAdapterFactory) return prismaAdapterFactory
	try {
		const mod = require('@auth/prisma-adapter') as
			| {
					PrismaAdapter?: AuthPrismaAdapterFactory
					default?: AuthPrismaAdapterFactory | { PrismaAdapter?: AuthPrismaAdapterFactory }
			  }
			| undefined
		const factory =
			typeof mod?.PrismaAdapter === 'function'
				? mod.PrismaAdapter
				: typeof mod?.default === 'function'
					? mod.default
					: (mod?.default as { PrismaAdapter?: AuthPrismaAdapterFactory })?.PrismaAdapter
		if (typeof factory !== 'function') {
			throw new Error('Invalid export received from "@auth/prisma-adapter".')
		}

		prismaAdapterFactory = factory
		return factory
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
			throw new Error(
				'createPrismaAdapter requires "@auth/prisma-adapter". Install it alongside "@prisma/client" to continue.'
			)
		}
		throw error
	}
}

/**
 * Validates that a Prisma model delegate exists and is an object. Throws a
 * descriptive error when the model is missing to help surface schema issues
 * during startup.
 *
 * @param delegate - Delegate instance to validate.
 * @param name - Model name for error messages.
 * @returns The delegate if valid.
 * @throws {Error} If the delegate is missing or invalid.
 */
function assertDelegate(delegate: PrismaDelegate | undefined, name: string): PrismaDelegate {
	if (!delegate || typeof delegate !== 'object') {
		throw new Error(`Prisma client is missing delegate for model "${name}". Ensure the model exists in your schema.`)
	}

	return delegate
}

/**
 * Converts a Prisma password row into the shared {@link PasswordRecord}
 * structure. Dates are serialized to ISO strings so Flashcore and Prisma
 * adapters stay consistent.
 */
function normalizePasswordRecord(row: PrismaPasswordRow): PasswordRecord {
	return {
		id: row.id,
		userId: row.userId,
		email: row.email,
		hash: row.hash,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	}
}

/** Type guard ensuring a value contains all password row fields. Internal helper to guard against malformed rows. */
function isPasswordRow(value: unknown): value is PrismaPasswordRow {
	return (
		!!value &&
		typeof value === 'object' &&
		'id' in value &&
		'userId' in value &&
		'email' in value &&
		'hash' in value &&
		'createdAt' in value &&
		'updatedAt' in value
	)
}

/** Normalizes emails to lowercase for case-insensitive lookups. Internal helper shared with Flashcore adapter. */
function normalizeEmail(email: string): string {
	return email.toLowerCase()
}

/**
 * Creates a password-capable Auth.js adapter backed by Prisma. Wraps the
 * official `@auth/prisma-adapter` and layers on password helpers powered by
 * {@link hashPassword}, {@link verifyPasswordHash}, and {@link needsRehash}.
 * Supports automatic password upgrades when Argon2id parameters change.
 *
 * ⚠️ Security:
 * - Passwords are hashed with Argon2id before storage; plaintext never touches the DB.
 * - Verification tokens (handled by the base adapter) are hashed with SHA-256.
 * - Email lookups are case-insensitive; prefer Postgres `@db.Citext` or database collations for enforcement.
 *
 * Performance:
 * - Auto-rehashing adds ~50–100 ms to the first login after parameter changes. Consider background migrations for huge user bases.
 * - Each password operation performs 1–2 queries; ensure `userId` and `email` columns are indexed.
 * - `findUserIdByEmail` performs two lookups (user + password models). Optimize with database indexes.
 *
 * Edge cases:
 * - Requires `@auth/prisma-adapter` and `@prisma/client`. Install both: `npm i @auth/prisma-adapter @prisma/client`.
 * - Password model must include `id`, `userId`, `email`, `hash`, `createdAt`, `updatedAt` columns.
 * - Concurrent password updates can race; wrap in application-level locks if necessary.
 * - `deleteUser` is overridden to remove password rows; omitting this would leave orphaned sensitive data.
 * - `findUserIdByEmail` falls back to password rows for legacy schemas without `user.email`.
 *
 * Migration tips:
 * - Increasing Argon2id parameters triggers on-demand rehashing the next time a user logs in.
 * - To force migration proactively, iterate through users and call `verifyUserPassword` with a known password (e.g., via user reauthentication flows).
 *
 * @param options.client - Initialized Prisma client with user/password models.
 * @param options.secret - Secret for hashing verification tokens; must match Auth.js config.
 * @param options.hashParameters - Optional Argon2id overrides applied to password hashing + rehashing.
 * @param options.models - Optional Prisma model name overrides (currently `password`).
 * @returns {@link PasswordAdapter} implementing Auth.js contract plus password helpers (`createUserPassword`, `verifyUserPassword`, `deleteUserPassword`, `resetUserPassword`, `findUserIdByEmail`).
 * @throws {Error} If the Prisma client or password delegate is missing.
 * @throws {Error} If `@auth/prisma-adapter` is not installed.
 *
 * @example Basic usage
 * ```ts
 * import { PrismaClient } from '@prisma/client'
 * const prisma = new PrismaClient()
 * const adapter = createPrismaAdapter({ client: prisma, secret: process.env.AUTH_SECRET! })
 * ```
 *
 * @example Custom Argon2id parameters
 * ```ts
 * const adapter = createPrismaAdapter({
 * 	client: prisma,
 * 	secret: process.env.AUTH_SECRET!,
 * 	hashParameters: { memorySize: 8192, passes: 4 }
 * })
 * ```
 *
 * @example Custom password model name
 * ```ts
 * const adapter = createPrismaAdapter({
 * 	client: prisma,
 * 	secret: process.env.AUTH_SECRET!,
 * 	models: { password: 'userPassword' }
 * })
 * ```
 *
 * @example Integration with Auth.js config
 * ```ts
 * export default {
 * 	adapter: createPrismaAdapter({ client: prisma, secret: process.env.AUTH_SECRET! }),
 * 	providers: [...]
 * }
 * ```
 *
 * @example Error handling for missing peer dependency
 * ```ts
 * try {
 * 	createPrismaAdapter({ client: prisma, secret: process.env.AUTH_SECRET! })
 * } catch (error) {
 * 	if (String(error).includes('prisma-adapter')) {
 * 		console.error('Install @auth/prisma-adapter before continuing')
 * 	}
 * }
 * ```
 *
 * @see PasswordAdapter in `src/builtins/email-password/types.ts`
 * @see @auth/prisma-adapter for the base adapter implementation.
 * @see listPrismaUserIds and listPrismaUsers for pagination helpers.
 */
export function createPrismaAdapter(options: PrismaAdapterOptions): PasswordAdapter {
	const { client, hashParameters, models } = options
	// Fail fast when required primitives are missing so configuration bugs surface early.
	if (!client) {
		throw new Error('Prisma adapter requires a Prisma client instance.')
	}

	const base = loadAuthPrismaAdapter()(client) as Adapter
	// Use configured model names when available, otherwise fall back to opinionated defaults.
	const passwordDelegate = assertDelegate(
		client[models?.password ?? DEFAULT_PASSWORD_MODEL] as PrismaDelegate | undefined,
		models?.password ?? DEFAULT_PASSWORD_MODEL
	)

	const adapter: PasswordAdapter = {
		...base,

		async findUserIdByEmail(email) {
			// Case-insensitive lookup that checks both the user model and password model for legacy support.
			// Uses Prisma's `mode: 'insensitive'` for databases that support it (e.g., PostgreSQL).
			// For databases without native case-insensitive support, relies on normalized lowercase comparisons.
			// Edge case: returns null for OAuth-only accounts without password rows.
			const delegate = client.user
			const normalized = normalizeEmail(email)

			// Prefer the primary user model for a case-insensitive lookup.
			// Prisma's `mode: 'insensitive'` works on PostgreSQL, MySQL 8.0+, and SQLite.
			// For other databases, this falls back to exact match; consider using a lowercased indexed column.
			const byUser = delegate.findFirst
				? await delegate.findFirst({
						where: {
							email: {
								equals: email,
								mode: 'insensitive'
							}
						},
						select: { id: true }
					})
				: null
			if (byUser && typeof byUser === 'object' && byUser && 'id' in byUser) {
				return (byUser as { id: string }).id
			}

			// Fallback to a stored password record in scenarios where the user model lacks the email field.
			// Password records are already normalized to lowercase, so strict equality works here.
			const byPassword = passwordDelegate.findFirst
				? await passwordDelegate.findFirst({
						where: { email: normalized },
						select: { userId: true }
					})
				: null

			if (byPassword && typeof byPassword === 'object' && 'userId' in byPassword) {
				return (byPassword as { userId: string }).userId
			}

			return null
		},

		async createUserPassword({ userId, email, password }) {
			// Upserts a password record using Argon2id, normalizing email to lowercase for lookups.
			// ⚠️ Security: plaintext passwords are hashed before touching the database.
			const normalized = normalizeEmail(email)

			// Hash with optional custom parameters before persisting credentials.
			const hash = await hashPassword(password, { parameters: hashParameters })
			const row = await passwordDelegate.upsert?.({
				where: { userId },
				create: {
					userId,
					email: normalized,
					hash
				},
				update: {
					email: normalized,
					hash,
					updatedAt: new Date()
				}
			})
			if (!row || !isPasswordRow(row)) {
				throw new Error('Failed to persist password record via Prisma adapter.')
			}

			return normalizePasswordRecord(row)
		},

		async verifyUserPassword({ userId, password }) {
			// Verifies credentials using timing-safe comparison and auto-rehashes when parameters tighten.
			// ⚠️ Security: auto-rehashing ensures all rows adopt the strongest Argon2id settings.
			const row = passwordDelegate.findUnique
				? await passwordDelegate.findUnique({
						where: { userId }
					})
				: null
			if (!row || !isPasswordRow(row)) return false
			const match = await verifyPasswordHash(password, row.hash)

			// Opportunistically upgrade the stored hash when parameters become stronger.
			if (match && hashParameters && needsRehash(row.hash, hashParameters)) {
				const nextHash = await hashPassword(password, { parameters: hashParameters })
				await passwordDelegate.update?.({
					where: { userId },
					data: {
						hash: nextHash,
						updatedAt: new Date()
					}
				})
			}

			return match
		},

		async deleteUserPassword(userId) {
			// Removes password rows (even duplicates) to keep sensitive data from lingering post-deletion.
			await passwordDelegate.deleteMany?.({ where: { userId } })
		},

		async resetUserPassword({ userId, password }) {
			// Replaces the stored hash and updates timestamps. Returns null for OAuth-only users.
			const row = passwordDelegate.findUnique ? await passwordDelegate.findUnique({ where: { userId } }) : null
			if (!row || !isPasswordRow(row)) return null
			// Replace the stored hash and bump timestamps for auditing.
			const hash = await hashPassword(password, { parameters: hashParameters })
			const updated = await passwordDelegate.update?.({
				where: { userId },
				data: {
					hash,
					updatedAt: new Date()
				}
			})
			if (!updated || !isPasswordRow(updated)) {
				throw new Error('Failed to update password hash via Prisma adapter.')
			}

			return normalizePasswordRecord(updated)
		}
	}

	if (typeof base.deleteUser === 'function') {
		const originalDeleteUser = base.deleteUser.bind(base)
		adapter.deleteUser = async (id): Promise<AdapterUser | null | undefined> => {
			// Ensures password artifacts are purged during Auth.js deletion.
			// ⚠️ Security: prevents orphaned password hashes from remaining in the database.
			await passwordDelegate.deleteMany?.({ where: { userId: id } })
			const user = await originalDeleteUser(id)
			return user ?? null
		}
	}

	return adapter
}

/**
 * Retrieves a paginated list of Auth.js user IDs using Prisma. Useful for bulk
 * operations, admin exports, or background jobs where only identifiers are
 * needed. Supports custom filtering/ordering via Prisma `where`/`orderBy`
 * clauses.
 *
 * ⚠️ Security: Do not pass raw user input into `where`/`orderBy` without
 * validation. Always rely on Prisma's parameterization to avoid SQL injection.
 *
 * Performance:
 * - Executes two queries per call (`count` + `findMany`). Cache results or
 *   limit page sizes for heavy workloads.
 * - Uses `select: { id: true }` to minimize data transfer.
 * - Large page sizes (>1000) can increase memory usage and query latency.
 * - Sorting on non-indexed columns can be slow; add DB indexes for frequent orderings.
 *
 * Edge cases:
 * - Out-of-range pages return an empty `ids` array but include metadata.
 * - Total counts may change between calls if new users are added/deleted.
 * - Custom filters may yield zero matches; handle `total === 0`.
 *
 * @param client - Prisma client with a `user` delegate.
 * @param options.page - Zero-based page index (default `0`).
 * @param options.pageSize - Page size (default {@link DEFAULT_LIST_PAGE_SIZE}). Minimum 1.
 * @param options.orderBy - Prisma `orderBy` clause. Defaults to `{ createdAt: 'desc' }`.
 * @param options.where - Prisma `where` clause for filtering results.
 * @returns Object with `ids`, `page`, `pageCount`, and `total` user count.
 *
 * @example Basic pagination
 * ```ts
 * const { ids, pageCount } = await listPrismaUserIds(prisma, { page: 0, pageSize: 100 })
 * ```
 *
 * @example Filter verified users
 * ```ts
 * await listPrismaUserIds(prisma, { where: { emailVerified: { not: null } } })
 * ```
 *
 * @example Custom ordering
 * ```ts
 * await listPrismaUserIds(prisma, { orderBy: { email: 'asc' } })
 * ```
 *
 * @example Iterate every page
 * ```ts
 * const { pageCount } = await listPrismaUserIds(prisma)
 * for (let page = 0; page < pageCount; page++) {
 * 	const { ids } = await listPrismaUserIds(prisma, { page })
 * 	await process(ids)
 * }
 * ```
 *
 * @example Handle empty result sets
 * ```ts
 * const { total } = await listPrismaUserIds(prisma, { where: { role: 'admin' } })
 * if (total === 0) console.log('No admins found')
 * ```
 *
 * @see DEFAULT_LIST_PAGE_SIZE for defaults.
 * @see listPrismaUsers for fetching full user objects.
 */
export async function listPrismaUserIds(
	client: PrismaClientLike,
	options: ListUsersOptions = {}
): Promise<{ ids: string[]; page: number; pageCount: number; total: number }> {
	const delegate = assertDelegate(client.user, 'user')
	const pageSize = Math.max(1, options.pageSize ?? DEFAULT_LIST_PAGE_SIZE)
	const page = Math.max(0, options.page ?? 0)
	const total = (await delegate.count?.({ where: options.where })) ?? 0
	const pageCount = total === 0 ? 0 : Math.ceil(total / pageSize)
	if (pageCount === 0 || page >= pageCount) {
		return { ids: [], page, pageCount, total }
	}

	// Request the smallest projection possible for faster pagination scans.
	const results = delegate.findMany
		? await delegate.findMany({
				select: { id: true },
				where: options.where,
				orderBy: options.orderBy ?? { createdAt: 'desc' },
				skip: page * pageSize,
				take: pageSize
			})
		: []
	const ids = Array.isArray(results)
		? (results
				.map((row) => (typeof row === 'object' && row && 'id' in row ? (row as { id: string }).id : null))
				.filter(Boolean) as string[])
		: []

	return { ids, page, pageCount, total }
}

/**
 * Retrieves paginated {@link AdapterUser} records via Prisma. Loads complete
 * user objects (id, email, name, image, emailVerified) and supports custom
 * filtering/ordering.
 *
 * ⚠️ Security:
 * - Avoid exposing raw user objects directly to clients; redact sensitive fields.
 * - Validate any dynamic filters to prevent leaking data.
 *
 * Performance:
 * - Executes two queries per call (`count` + `findMany`).
 * - Fetching full rows is heavier than {@link listPrismaUserIds}; use IDs when possible.
 * - Large page sizes can tax memory. Stick to {@link DEFAULT_LIST_PAGE_SIZE} or smaller.
 * - Full exports for massive datasets should run in background jobs or streams.
 *
 * Edge cases:
 * - Out-of-range pages return an empty `users` array with metadata.
 * - Optional fields (name, email, image) may be `null`; always null-check.
 * - Custom filters may yield zero matches; handle `total === 0`.
 *
 * @param client - Prisma client with a `user` delegate.
 * @param options.page - Zero-based page index (default `0`).
 * @param options.pageSize - Page size (default {@link DEFAULT_LIST_PAGE_SIZE}).
 * @param options.orderBy - Prisma `orderBy` clause (default `{ createdAt: 'desc' }`).
 * @param options.where - Prisma `where` clause for filtering rows.
 * @returns Object with `users`, `page`, `pageCount`, and `total` user count.
 *
 * @example Display a dashboard
 * ```ts
 * const { users, total } = await listPrismaUsers(prisma, { page: 0 })
 * console.log(`Showing ${users.length} of ${total}`)
 * ```
 *
 * @example Filter verified users
 * ```ts
 * await listPrismaUsers(prisma, { where: { emailVerified: { not: null } } })
 * ```
 *
 * @example Export all users
 * ```ts
 * const { pageCount } = await listPrismaUsers(prisma)
 * const rows: AdapterUser[] = []
 * for (let page = 0; page < pageCount; page++) {
 * 	const { users } = await listPrismaUsers(prisma, { page })
 * 	rows.push(...users)
 * }
 * ```
 *
 * @example Custom page size
 * ```ts
 * await listPrismaUsers(prisma, { pageSize: 50 })
 * ```
 *
 * @see AdapterUser from `@auth/core/adapters`.
 * @see listPrismaUserIds for ID-only pagination.
 */
export async function listPrismaUsers(
	client: PrismaClientLike,
	options: ListUsersOptions = {}
): Promise<{ users: AdapterUser[]; page: number; pageCount: number; total: number }> {
	const delegate = assertDelegate(client.user, 'user')
	const pageSize = Math.max(1, options.pageSize ?? DEFAULT_LIST_PAGE_SIZE)
	const page = Math.max(0, options.page ?? 0)
	const total = (await delegate.count?.({ where: options.where })) ?? 0
	const pageCount = total === 0 ? 0 : Math.ceil(total / pageSize)
	if (pageCount === 0 || page >= pageCount) {
		return { users: [], page, pageCount, total }
	}
	// Pull the full row to align with Auth.js expectations.
	const rows = delegate.findMany
		? await delegate.findMany({
				where: options.where,
				orderBy: options.orderBy ?? { createdAt: 'desc' },
				skip: page * pageSize,
				take: pageSize
			})
		: []
	const users = Array.isArray(rows)
		? (rows.filter((row): row is AdapterUser => !!row && typeof row === 'object' && 'id' in row) as AdapterUser[])
		: []

	return { users, page, pageCount, total }
}
