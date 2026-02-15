import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { getStageServer } from '../../../../../core/stage.js'
import { badRequest, notFound } from '../../../utils.js'
import { getActivityHostManager } from '../../../../../activity/index.js'

interface RpcBody {
	message: unknown
	frame_id?: string
	instance_id?: string
}

/**
 * POST /api/control/sessions/:id/activity/rpc
 *
 * Send a raw RPC message into the Activity host and return outbound messages.
 * Mirrors the Stage WS `activity_rpc` handler behavior.
 */
export async function POST(request: RoboRequest): Promise<Response> {
	const { id: sessionId } = request.params as { id: string }
	if (!sessionId) return notFound('Session ID required')

	const session = sessionManager.get(sessionId)
	if (!session) return notFound('Session not found')

	let body: RpcBody
	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	if (!('message' in (body as Record<string, unknown>))) {
		return badRequest('message is required')
	}

	const hostManager = getActivityHostManager()

	const resolvedRpcSessionId = hostManager.resolveSessionId({
		frame_id: body.frame_id,
		instance_id: body.instance_id,
		session_id: sessionId
	})
	if (!resolvedRpcSessionId) {
		return new Response(JSON.stringify({ message: 'Cannot route RPC: no active Activity', code: 'NO_ACTIVITY' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const record = hostManager.getRecord(resolvedRpcSessionId)
	if (!record) {
		return new Response(JSON.stringify({ message: 'No active Activity', code: 'NO_ACTIVITY' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Record inbound
	try {
		session.recorder.record('activity_rpc_inbound', {
			instance_id: record.instance_id,
			frame_id: body.frame_id ?? record.frame_id,
			message: body.message
		})
	} catch {
		// ignore
	}

	const rpcResult = hostManager.handleInbound(resolvedRpcSessionId, body.message)

	// Record outbound
	try {
		if (rpcResult.outbound.length > 0) {
			session.recorder.record('activity_rpc_outbound', {
				instance_id: record.instance_id,
				messages: rpcResult.outbound
			})
		}
	} catch {
		// ignore
	}

	// If AUTHORIZE is pending consent (manual mode), notify Stage UI if connected.
	try {
		if (rpcResult._pending_authorize) {
			const actRecord = hostManager.getRecord(resolvedRpcSessionId)
			if (actRecord?.pending_authorize) {
				getStageServer().broadcastToSession(sessionId, {
					type: 'activity.ui.authorize_request',
					data: {
						nonce: actRecord.pending_authorize.nonce,
						instance_id: actRecord.instance_id,
						client_id: actRecord.pending_authorize.client_id,
						scopes: actRecord.pending_authorize.scopes,
						state: actRecord.pending_authorize.state,
						response_type: actRecord.pending_authorize.response_type,
						prompt: actRecord.pending_authorize.prompt
					}
				})
			}
		}
	} catch {
		// ignore
	}

	// If START_PURCHASE is pending modal, notify Stage UI if connected.
	try {
		if (rpcResult._pending_purchase) {
			const actRecord = hostManager.getRecord(resolvedRpcSessionId)
			if (actRecord?.pending_purchase) {
				getStageServer().broadcastToSession(sessionId, {
					type: 'activity.ui.purchase_request',
					data: {
						nonce: actRecord.pending_purchase.nonce,
						instance_id: actRecord.instance_id,
						sku_id: actRecord.pending_purchase.sku_id,
						sku_name: actRecord.pending_purchase.sku_name,
						sku_price: actRecord.pending_purchase.sku_price
					}
				})
			}
		}
	} catch {
		// ignore
	}

	return new Response(
		JSON.stringify({
			outbound: rpcResult.outbound,
			pending_authorize: Boolean(rpcResult._pending_authorize),
			pending_purchase: Boolean(rpcResult._pending_purchase)
		}),
		{ status: 200, headers: { 'Content-Type': 'application/json' } }
	)
}

