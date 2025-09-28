import type { AuthConfig } from '@auth/core'
import type { Adapter, AdapterUser } from '@auth/core/adapters'
import type { CookiesOptions } from '@auth/core/types'
import type { RoboRequest } from '@robojs/server'
import type { RequestPayloadHandle } from '../../utils/request-payload.js'

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

export interface PasswordAdapter extends Adapter {
	createUserPassword(params: { userId: string; email: string; password: string }): Promise<PasswordRecord>
	verifyUserPassword(params: { userId: string; password: string }): Promise<boolean>
	findUserIdByEmail(email: string): Promise<string | null>
	deleteUserPassword(userId: string): Promise<void>
	resetUserPassword(params: { userId: string; password: string }): Promise<PasswordRecord | null>
	createPasswordResetToken(userId: string, ttlMinutes?: number): Promise<PasswordResetToken>
	usePasswordResetToken(token: string): Promise<PasswordResetToken | null>
}

export interface EmailPasswordProviderOptions {
	adapter: PasswordAdapter
	name?: string
	authorize?: EmailPasswordAuthorize
	routes?: EmailPasswordRouteOverrides
}

export interface EmailPasswordAuthorizeContext {
	adapter: PasswordAdapter
	defaultAuthorize: () => Promise<AdapterUser | null>
	request: Request | undefined
}

export type EmailPasswordAuthorize = (
	credentials: Record<string, unknown> | undefined,
	context: EmailPasswordAuthorizeContext
) => Promise<AdapterUser | null>

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

export interface EmailPasswordRouteOverrides {
	signup?: EmailPasswordRouteHandler
	passwordResetRequest?: EmailPasswordRouteHandler
	passwordResetConfirm?: EmailPasswordRouteHandler
}

export interface EmailPasswordProviderMetadata {
	routes?: EmailPasswordRouteOverrides
}

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
