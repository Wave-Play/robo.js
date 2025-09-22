import argon2 from 'argon2'
import CredentialsProvider from '@auth/core/providers/credentials'
import type { Adapter, AdapterUser } from '@auth/core/adapters'
import { nanoid } from 'nanoid'
import { Flashcore } from 'robo.js'
import { authLogger } from '../utils/logger.js'

type ProviderLike = ReturnType<typeof CredentialsProvider>

const PASSWORD_KEY = (userId: string) => `auth:password:${userId}`
const PASSWORD_EMAIL_KEY = (email: string) => `auth:passwordUserByEmail:${email.toLowerCase()}`
const RESET_TOKEN_KEY = (token: string) => `auth:passwordReset:${token}`

export interface PasswordRecord {
	id: string
	userId: string
	email: string
	hash: string
	createdAt: string
	updatedAt: string
}

export interface PasswordResetToken {
	token: string
	userId: string
	expires: Date
}

/**
 * Hashes and persists user credentials in Flashcore.
 *
 * @example
 * ```ts
 * await storePassword(user.id, 'user@example.com', 'p@ssw0rd')
 * ```
 */
export async function storePassword(userId: string, email: string, password: string): Promise<PasswordRecord> {
	const hash = await argon2.hash(password, { type: argon2.argon2id })
	const now = new Date().toISOString()
	const record: PasswordRecord = {
		id: nanoid(16),
		email: email.toLowerCase(),
		hash,
		userId,
		createdAt: now,
		updatedAt: now
	}
	await Flashcore.set(PASSWORD_KEY(userId), record)
	await Flashcore.set(PASSWORD_EMAIL_KEY(record.email), userId)
	return record
}

/**
 * Compares a plaintext password to the stored hash for the given user id.
 *
 * @example
 * ```ts
 * const ok = await verifyPassword(userId, 'p@ssw0rd')
 * ```
 */
export async function verifyPassword(userId: string, password: string): Promise<boolean> {
	const record = await Flashcore.get<PasswordRecord | null>(PASSWORD_KEY(userId))
	if (!record) return false
	return argon2.verify(record.hash, password)
}

/**
 * Resolves the user id associated with a credential-enabled email address.
 *
 * @example
 * ```ts
 * const userId = await findUserIdByEmail('user@example.com')
 * ```
 */
export async function findUserIdByEmail(email: string): Promise<string | null> {
	const id = await Flashcore.get<string | null>(PASSWORD_EMAIL_KEY(email))
	return id ?? null
}

/**
 * Removes the password hash and associated email lookup for a user.
 *
 * @example
 * ```ts
 * await removePassword(userId)
 * ```
 */
export async function removePassword(userId: string): Promise<void> {
	const record = await Flashcore.get<PasswordRecord | null>(PASSWORD_KEY(userId))
	if (record?.email) {
		await Flashcore.delete(PASSWORD_EMAIL_KEY(record.email))
	}
	await Flashcore.delete(PASSWORD_KEY(userId))
}

/**
 * Creates a password reset token with the provided TTL (in minutes).
 *
 * @example
 * ```ts
 * const token = await createResetToken(userId, 15)
 * ```
 */
export async function createResetToken(userId: string, ttlMinutes = 30): Promise<PasswordResetToken> {
	const token = nanoid(32)
	const expires = new Date(Date.now() + ttlMinutes * 60 * 1000)
	await Flashcore.set(RESET_TOKEN_KEY(token), { userId, expires })
	return { token, userId, expires }
}

/**
 * Consumes and validates a previously issued password reset token.
 *
 * @example
 * ```ts
 * const reset = await useResetToken(token)
 * ```
 */
export async function useResetToken(token: string): Promise<PasswordResetToken | null> {
	const record = await Flashcore.get<{ userId: string; expires: string | Date } | null>(RESET_TOKEN_KEY(token))
	if (!record) return null
	await Flashcore.delete(RESET_TOKEN_KEY(token))
	const expires = record.expires instanceof Date ? record.expires : new Date(record.expires)
	if (expires < new Date()) {
		authLogger.debug('Ignoring expired password reset token')
		return null
	}
	return { token, userId: record.userId, expires }
}

/**
 * Replaces a user's password hash after a successful reset flow.
 *
 * @example
 * ```ts
 * await resetPassword(userId, 'n3wp@ss')
 * ```
 */
export async function resetPassword(userId: string, password: string): Promise<PasswordRecord | null> {
	const existing = await Flashcore.get<PasswordRecord | null>(PASSWORD_KEY(userId))
	if (!existing) return null
	const hash = await argon2.hash(password, { type: argon2.argon2id })
	const updated: PasswordRecord = {
		...existing,
		hash,
		updatedAt: new Date().toISOString()
	}
	await Flashcore.set(PASSWORD_KEY(userId), updated)
	return updated
}

export interface PasswordCredentialsProviderOptions {
	adapter: Adapter
	allowRegistration?: boolean
	name?: string
}

/**
 * Returns a Credentials provider backed by the Flashcore password helpers.
 *
 * @example
 * ```ts
 * const adapter = createFlashcoreAdapter({ secret })
 * const credentialsProvider = passwordCredentialsProvider({ adapter })
 * ```
 */
export function passwordCredentialsProvider(options: PasswordCredentialsProviderOptions): ProviderLike {
	const { adapter, allowRegistration = false, name = 'Email & Password' } = options
	return CredentialsProvider({
		name,
		credentials: {
			email: { label: 'Email', type: 'email' },
			password: { label: 'Password', type: 'password' }
		},
		authorize: async (credentials: Record<string, unknown> | undefined) => {
			authLogger.debug('Authorizing credentials login', { email: credentials?.email, password: credentials?.password ? '****' : undefined })
			const email = String(credentials?.email ?? '').toLowerCase()
			const password = String(credentials?.password ?? '')
			if (!email || !password) {
				authLogger.warn('Missing email or password in credentials')
				return null
			}

			const userId = await findUserIdByEmail(email)

			if (!userId && allowRegistration) {
				authLogger.debug('Registering new user', { email })
				if (!adapter.createUser) {
					throw new Error('Adapter.createUser is required when allowRegistration is enabled.')
				}
				const newUser: AdapterUser = {
					email,
					emailVerified: null,
					id: nanoid(21),
					name: email
				}
				const user = await adapter.createUser(newUser)
				await storePassword(user.id, email, password)
				return user
			}

			if (!userId) {
				authLogger.debug(`No user found for email ${email}`)
				return null
			}

			const isValid = await verifyPassword(userId, password)
			if (!isValid) {
				authLogger.debug(`Invalid password attempt for ${email}`)
				return null
			}

			return adapter.getUser ? adapter.getUser(userId) : null
		}
	}) as ProviderLike
}

export default function EmailPassword(options: PasswordCredentialsProviderOptions): ProviderLike {
	return passwordCredentialsProvider(options)
}
