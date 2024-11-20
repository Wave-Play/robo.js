import { request } from './client.js'
import type { OAuthSession, OAuthSessionStatus, User } from './types.js'

interface CreateOAuthResult extends OAuthSession {
	error?: string
	success: boolean
}

export async function createOAuth() {
	return request<CreateOAuthResult>('/oauth', {
		method: 'POST'
	})
}

interface PollOAuthOptions {
	token: string
}

interface PollOAuthResult {
	error?: string
	status: OAuthSessionStatus
	success: boolean
}

export async function pollOAuth(options: PollOAuthOptions) {
	const { token } = options

	return request<PollOAuthResult>(`/oauth/${token}/poll`)
}

interface VerifyOAuthOptions {
	secret?: string
	token: string
}

interface VerifyOAuthResult {
	error?: string
	status: OAuthSessionStatus
	success: boolean
	user?: User | null
	userToken?: string | null
}

export async function verifyOAuth(options: VerifyOAuthOptions) {
	const { secret, token } = options

	return request<VerifyOAuthResult>(`/oauth/${token}/verify`, {
		method: 'PUT',
		body: { secret }
	})
}
