import { request } from './client.js'
import type { User } from './types.js'

type OAuthSessionStatus = 'Authorized' | 'Created' | 'Expired' | 'Invalid' | 'Paired' | 'Used'

interface OAuthSession {
	pairingCode: string
	secret: string
	status: OAuthSessionStatus
	token: string
}

export async function createOAuth() {
	return request<OAuthSession>('/oauth', {
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
	pairingCode: string
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
	const { pairingCode, secret, token } = options

	return request<VerifyOAuthResult>(`/oauth/${token}/verify`, {
		method: 'PUT',
		body: { pairingCode, secret }
	})
}

