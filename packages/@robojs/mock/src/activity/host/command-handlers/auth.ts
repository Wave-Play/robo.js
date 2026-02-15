import { sessionManager } from '../../../core/manager.js'
import { mockLogger } from '../../../core/logger.js'
import { buildCommandResponse, buildErrorResponse } from '../rpc-envelope.js'
import type { InboundRpcMessage } from '../rpc-envelope.js'
import type { ActivitySessionRecord } from '../activity-session-record.js'
import type { ActivityHostManager, HandleInboundResult } from '../activity-host-manager.js'
import type { RpcCommandDefinition } from '../../schema/manifest-types.js'
import { RpcErrorCode } from '../error-codes.js'

/**
 * Generate a deterministic fake OAuth authorization code.
 */
function generateFakeAuthCode(instanceId: string): string {
	return `mock_auth_code_${instanceId}_${Date.now().toString(36)}`
}

/**
 * AUTHORIZE: Three-mode implementation.
 *
 * 1. auto_approve (default): Returns code immediately, like Phase 2.
 * 2. auto_deny: Returns ERROR 4003 immediately.
 * 3. manual: Sets pending_authorize on record, returns empty outbound
 *    so the caller (Stage WS handler) can emit the UI consent event.
 *
 * Spec section 5.1:
 * - Request: { cmd: "AUTHORIZE", nonce, args: { client_id, response_type, scope, state, prompt } }
 * - Response: { cmd: "AUTHORIZE", nonce, data: { code, state } }
 */
export function handleAuthorize(
	parsed: InboundRpcMessage,
	record: ActivitySessionRecord,
	_manager: ActivityHostManager,
	_commandDef: RpcCommandDefinition
): HandleInboundResult {
	const clientId = (parsed.args?.client_id as string) ?? record.application_id
	const responseType = (parsed.args?.response_type as string) ?? 'code'
	const requestedScopes = Array.isArray(parsed.args?.scope)
		? (parsed.args.scope as string[])
		: typeof parsed.args?.scope === 'string'
			? [parsed.args.scope as string]
			: ['identify', 'guilds']
	const state = (parsed.args?.state as string) ?? null
	const prompt = (parsed.args?.prompt as string) ?? null

	const mode = record.devtools_auth.mode

	// --- Auto-approve mode ---
	if (mode === 'auto_approve') {
		const approvedScopes = record.devtools_auth.default_scopes.length > 0
			? record.devtools_auth.default_scopes
			: requestedScopes
		const code = generateFakeAuthCode(record.instance_id)

		// Store authorized scopes for later use in AUTHENTICATE
		record.auth.authorized_scopes = approvedScopes

		mockLogger.debug(`AUTHORIZE auto-approved for instance=${record.instance_id}`)

		return {
			outbound: [
				buildCommandResponse(parsed.cmd, parsed.nonce, {
					code,
					state
				})
			]
		}
	}

	// --- Auto-deny mode ---
	if (mode === 'auto_deny') {
		mockLogger.debug(`AUTHORIZE auto-denied for instance=${record.instance_id}`)

		return {
			outbound: [
				buildErrorResponse(parsed.nonce, RpcErrorCode.FORBIDDEN, 'Authorization denied by user')
			]
		}
	}

	// --- Manual mode: set pending, return empty outbound ---
	// The caller (ActivityHostManager or Stage WS handler) will detect
	// the pending_authorize and emit the UI consent event.
	record.pending_authorize = {
		nonce: parsed.nonce,
		client_id: clientId,
		scopes: requestedScopes,
		state,
		response_type: responseType,
		prompt,
		created_at: Date.now()
	}

	mockLogger.debug(`AUTHORIZE pending consent for instance=${record.instance_id}`)

	// Return empty outbound -- no RPC response yet.
	// The response will be sent when the consent result arrives.
	return { outbound: [], _pending_authorize: true }
}

/**
 * AUTHENTICATE: Accepts token, marks auth state, responds with user/scopes/expires.
 *
 * Spec section 5.2:
 * - Request: { cmd: "AUTHENTICATE", nonce, args: { access_token } }
 * - Response: { cmd: "AUTHENTICATE", nonce, data: { access_token, scopes, expires, user } }
 *
 * Enhancement from Phase 2:
 * - Uses scopes from the most recent successful AUTHORIZE (if available)
 * - Stores complete auth metadata on the record
 */
export function handleAuthenticate(
	parsed: InboundRpcMessage,
	record: ActivitySessionRecord,
	_manager: ActivityHostManager,
	_commandDef: RpcCommandDefinition
): HandleInboundResult {
	const token = (parsed.args?.access_token as string) ?? `mock_token_${record.instance_id}`

	// Determine scopes: use those from last AUTHORIZE if available,
	// otherwise use DevTools defaults, otherwise fallback
	const scopes = record.auth.authorized_scopes
		?? (record.devtools_auth.default_scopes.length > 0 ? record.devtools_auth.default_scopes : ['identify', 'guilds'])

	const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

	// Mark session as authenticated
	record.auth = {
		state: 'AUTHENTICATED',
		access_token: token,
		scopes,
		expires,
		authorized_scopes: record.auth.authorized_scopes // Preserve from AUTHORIZE
	}

	// Resolve user data from mock session
	const mockSession = sessionManager.get(record.session_id)
	const user = mockSession?.state.users.get(record.user_id) ?? mockSession?.state.currentUser

	return {
		outbound: [
			buildCommandResponse(parsed.cmd, parsed.nonce, {
				access_token: record.auth.access_token,
				scopes: record.auth.scopes,
				expires: record.auth.expires,
				user: user
					? {
							id: user.id,
							username: user.username,
							discriminator: user.discriminator ?? '0',
							avatar: user.avatar ?? null,
							global_name: user.globalName ?? null
						}
					: {
							id: record.user_id,
							username: 'MockUser',
							discriminator: '0',
							avatar: null,
							global_name: null
						}
			})
		]
	}
}
