import { nanoid } from 'nanoid'
import { createRequire } from 'node:module'
import { hashToken } from '../utils/tokens.js'
import { hashPassword, needsRehash, verifyPasswordHash } from '../utils/password-hash.js'
import type { PasswordHashParams } from '../utils/password-hash.js'
import type { Adapter, AdapterUser } from '@auth/core/adapters'
import type { PasswordAdapter, PasswordRecord, PasswordResetToken } from '../builtins/email-password/types.js'

const DEFAULT_RESET_TOKEN_TTL_MINUTES = 30
const DEFAULT_LIST_PAGE_SIZE = 500
const DEFAULT_PASSWORD_MODEL = 'password'
const DEFAULT_RESET_MODEL = 'passwordResetToken'

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
	Describes the minimal surface of a Prisma client that the adapter expects.

	@example
	```ts
	import { PrismaClient } from '@prisma/client'
	const prisma = new PrismaClient()
	const adapter = createPrismaAdapter({ client: prisma, secret: process.env.AUTH_SECRET! })
	```
*/
export interface PrismaClientLike {
	[key: string]: PrismaDelegate | unknown
	user: PrismaDelegate
	$transaction?: (...operations: unknown[]) => Promise<unknown>
}

/**
	Allows mapping the adapter to custom Prisma model names when your schema deviates from defaults.

	@example
	```ts
	const adapter = createPrismaAdapter({
		client: prisma,
		secret: process.env.AUTH_SECRET!,
		models: { password: 'userPassword', passwordResetToken: 'userPasswordReset' }
	})
	```
*/
export interface PrismaAdapterModelOptions {
	password?: string
	passwordResetToken?: string
}

/**
	Configuration object accepted by {@link createPrismaAdapter}.

	@example
	```ts
	createPrismaAdapter({
		client: prisma,
		secret: process.env.AUTH_SECRET!,
		hashParameters: { memoryCost: 19456 }
	})
	```
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

interface PrismaPasswordResetRow {
	id: string
	userId: string
	tokenHash: string
	expiresAt: Date
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

/** Lazily resolve the optional Auth.js Prisma adapter so the root exports stay safe when unused. */
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

function assertDelegate(delegate: PrismaDelegate | undefined, name: string): PrismaDelegate {
	if (!delegate || typeof delegate !== 'object') {
		throw new Error(`Prisma client is missing delegate for model "${name}". Ensure the model exists in your schema.`)
	}

	return delegate
}

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

function isResetRow(value: unknown): value is PrismaPasswordResetRow {
	return (
		!!value &&
		typeof value === 'object' &&
		'id' in value &&
		'userId' in value &&
		'tokenHash' in value &&
		'expiresAt' in value
	)
}

function normalizeEmail(email: string): string {
	return email.toLowerCase()
}

/**
	Creates a password-capable Auth.js adapter backed by Prisma models.

	@example
	```ts
	import { createPrismaAdapter } from '@robojs/auth/adapters/prisma'
	const adapter = createPrismaAdapter({ client: prisma, secret: process.env.AUTH_SECRET! })
	```
*/
export function createPrismaAdapter(options: PrismaAdapterOptions): PasswordAdapter {
	const { client, secret, hashParameters, models } = options
	// Fail fast when required primitives are missing so configuration bugs surface early.
	if (!client) {
		throw new Error('Prisma adapter requires a Prisma client instance.')
	}
	if (!secret) {
		throw new Error('Prisma adapter requires a secret to hash password reset tokens.')
	}

	const base = loadAuthPrismaAdapter()(client) as Adapter
	// Use configured model names when available, otherwise fall back to opinionated defaults.
	const passwordDelegate = assertDelegate(
		client[models?.password ?? DEFAULT_PASSWORD_MODEL] as PrismaDelegate | undefined,
		models?.password ?? DEFAULT_PASSWORD_MODEL
	)
	const resetDelegate = assertDelegate(
		client[models?.passwordResetToken ?? DEFAULT_RESET_MODEL] as PrismaDelegate | undefined,
		models?.passwordResetToken ?? DEFAULT_RESET_MODEL
	)

	const adapter: PasswordAdapter = {
		...base,

		async findUserIdByEmail(email) {
			const delegate = client.user
			const normalized = normalizeEmail(email)

			// Prefer the primary user model for a case-insensitive lookup.
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
			// Remove any lingering password rows to keep orphaned data out of the database.
			await passwordDelegate.deleteMany?.({ where: { userId } })
		},

		async resetUserPassword({ userId, password }) {
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
		},

		async createPasswordResetToken(userId, ttlMinutes = DEFAULT_RESET_TOKEN_TTL_MINUTES) {
			const token = nanoid(32)
			const expires = new Date(Date.now() + ttlMinutes * 60 * 1000)
			const tokenHash = hashToken(token, secret)

			// Allow only one active reset token per user to avoid ambiguity.
			await resetDelegate.deleteMany?.({ where: { userId } })
			const created = await resetDelegate.create?.({
				data: {
					userId,
					tokenHash,
					expiresAt: expires
				}
			})
			if (!created || !isResetRow(created)) {
				throw new Error('Failed to create password reset token via Prisma adapter.')
			}

			return { token, userId, expires }
		},

		async usePasswordResetToken(token) {
			const tokenHash = hashToken(token, secret)
			const record = resetDelegate.findUnique ? await resetDelegate.findUnique({ where: { tokenHash } }) : null
			if (!record || !isResetRow(record)) return null

			// Reset tokens are single-use; remove them immediately after reading.
			await resetDelegate.delete?.({ where: { id: record.id } })
			if (record.expiresAt <= new Date()) {
				return null
			}

			return { token, userId: record.userId, expires: record.expiresAt } satisfies PasswordResetToken
		}
	}

	if (typeof base.deleteUser === 'function') {
		const originalDeleteUser = base.deleteUser.bind(base)
		adapter.deleteUser = async (id): Promise<AdapterUser | null | undefined> => {
			// Ensure password artifacts are purged alongside the Auth.js delete lifecycle.
			await resetDelegate.deleteMany?.({ where: { userId: id } })
			await passwordDelegate.deleteMany?.({ where: { userId: id } })
			const user = await originalDeleteUser(id)
			return user ?? null
		}
	}

	return adapter
}

/**
	Paged helper that returns only user identifiers via the Prisma client.

	@example
	```ts
	const { ids, pageCount } = await listPrismaUserIds(prisma, { page: 0, pageSize: 100 })
	```
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
	Lists full Auth.js users with pagination using the provided Prisma client.

	@example
	```ts
	const { users } = await listPrismaUsers(prisma, { where: { emailVerified: { not: null } } })
	```
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
