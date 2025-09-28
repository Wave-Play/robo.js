import type { AuthConfig } from '@auth/core'
import type { Adapter, AdapterUser } from '@auth/core/adapters'
import type { CookiesOptions } from '@auth/core/types'
import type { RoboRequest } from '@robojs/server'
import type { RequestPayloadHandle } from '../../utils/request-payload.js'

/** Persistent password metadata stored by the email-password provider. */
export interface PasswordRecord {
	id: string
	userId: string
	email: string
	hash: string
	createdAt: string
	updatedAt: string
}

/** Password reset token persisted for single-use verification. */
export interface PasswordResetToken {
	token: string
	userId: string
	expires: Date
}

/** Auth.js adapter contract extended with password management helpers. */
export interface PasswordAdapter extends Adapter {
	/** Persists a hashed password for the given user and returns the storage record. */
	createUserPassword(params: { userId: string; email: string; password: string }): Promise<PasswordRecord>
	/** Compares a plaintext password against the stored hash for the user. */
	verifyUserPassword(params: { userId: string; password: string }): Promise<boolean>
	/** Looks up the internal user id associated with an email address. */
	findUserIdByEmail(email: string): Promise<string | null>
	/** Removes any stored password material for a user. */
	deleteUserPassword(userId: string): Promise<void>
	/** Replaces the existing password hash and returns the updated record. */
	resetUserPassword(params: { userId: string; password: string }): Promise<PasswordRecord | null>
	/** Creates a time-limited token that allows the user to reset their password. */
	createPasswordResetToken(userId: string, ttlMinutes?: number): Promise<PasswordResetToken>
	/** Consumes a previously issued password reset token, if still valid. */
	usePasswordResetToken(token: string): Promise<PasswordResetToken | null>
}

/** Options accepted by the Email/Password provider factory. */
export interface EmailPasswordProviderOptions {
	adapter: PasswordAdapter
	name?: string
	authorize?: EmailPasswordAuthorize
	routes?: EmailPasswordRouteOverrides
}

/** Context object passed to custom `authorize` implementations. */
export interface EmailPasswordAuthorizeContext {
	adapter: PasswordAdapter
	defaultAuthorize: () => Promise<AdapterUser | null>
	request: Request | undefined
}

export type EmailPasswordAuthorize = (
	credentials: Record<string, unknown> | undefined,
	context: EmailPasswordAuthorizeContext
) => Promise<AdapterUser | null>

/** Arguments provided to Email/Password route overrides while processing a request. */
export interface EmailPasswordRouteContext {
	adapter: PasswordAdapter
	authConfig: AuthConfig
	basePath: string
	baseUrl: string
	cookies: CookiesOptions
	defaultHandler: () => Promise<Response>
	events?: AuthConfig['events']
	request: RoboRequest
	payload: RequestPayloadHandle
	secret: string
	sessionStrategy: 'jwt' | 'database'
}

export type EmailPasswordRouteHandler = (context: EmailPasswordRouteContext) => Promise<Response>

/** Optional handlers that replace built-in Email/Password routes. */
export interface EmailPasswordRouteOverrides {
	signup?: EmailPasswordRouteHandler
	passwordResetRequest?: EmailPasswordRouteHandler
	passwordResetConfirm?: EmailPasswordRouteHandler
}

/** Metadata returned from the Email/Password provider factory. */
export interface EmailPasswordProviderMetadata {
	routes?: EmailPasswordRouteOverrides
}

/**
 * Validates that a supplied Auth.js adapter implements password helper methods.
 *
 * @param adapter - Adapter instance provided by the user or plugin configuration.
 * @throws When required password helper functions are missing.
 *
 * @example
 * ```ts
 * assertPasswordAdapter(createFlashcoreAdapter({ secret }))
 * ```
 */
export function assertPasswordAdapter(
	adapter: Adapter | undefined
): asserts adapter is PasswordAdapter {
	if (!adapter) {
		throw new Error('Email-password provider requires an adapter. Provide one via plugin options or the Flashcore adapter.')
	}
	const missing: string[] = []
	const candidate = adapter as Partial<PasswordAdapter>
	if (typeof candidate.createUserPassword !== 'function') missing.push('createUserPassword')
	if (typeof candidate.verifyUserPassword !== 'function') missing.push('verifyUserPassword')
	if (typeof candidate.findUserIdByEmail !== 'function') missing.push('findUserIdByEmail')
	if (typeof (adapter as Partial<PasswordAdapter>).deleteUserPassword !== 'function') missing.push('deleteUserPassword')
	if (typeof candidate.resetUserPassword !== 'function') missing.push('resetUserPassword')
	if (typeof candidate.createPasswordResetToken !== 'function') missing.push('createPasswordResetToken')
	if (typeof candidate.usePasswordResetToken !== 'function') missing.push('usePasswordResetToken')
	if (missing.length) {
		throw new Error(
			`Adapter ${adapter.constructor?.name ?? 'instance'} is missing password helpers required by the email-password provider: ${missing.join(
				', '
			)}.`
		)
	}
}
