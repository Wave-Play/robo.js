import type { Adapter } from '@auth/core/adapters'

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
