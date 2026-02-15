import { buildCommandResponse, buildErrorResponse } from '../rpc-envelope.js'
import type { InboundRpcMessage } from '../rpc-envelope.js'
import type { ActivitySessionRecord } from '../activity-session-record.js'
import type { ActivityHostManager, HandleInboundResult } from '../activity-host-manager.js'
import type { RpcCommandDefinition } from '../../schema/manifest-types.js'
import { RpcErrorCode } from '../error-codes.js'

/**
 * IAP command handlers.
 * Reads from the session's IAP state store and handles START_PURCHASE flow.
 */
export function handleIapCommands(
	parsed: InboundRpcMessage,
	record: ActivitySessionRecord,
	_manager: ActivityHostManager,
	_commandDef: RpcCommandDefinition
): HandleInboundResult {
	switch (parsed.cmd) {
		case 'GET_SKUS':
		case 'GET_SKUS_EMBEDDED':
			return {
				outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, { skus: record.iap_state.skus })]
			}

		case 'GET_ENTITLEMENTS':
		case 'GET_ENTITLEMENTS_EMBEDDED': {
			let entitlements = record.iap_state.entitlements

			// Filter by sku_ids if provided
			const skuIds = (parsed.args as Record<string, unknown>)?.sku_ids as string[] | undefined
			if (skuIds && Array.isArray(skuIds) && skuIds.length > 0) {
				const skuIdSet = new Set(skuIds)
				entitlements = entitlements.filter((e) => skuIdSet.has(e.sku_id))
			}

			return {
				outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, { entitlements })]
			}
		}

		case 'START_PURCHASE': {
			const args = parsed.args as Record<string, unknown> | undefined
			const skuId = args?.sku_id as string | undefined

			if (!skuId) {
				return {
					outbound: [
						buildErrorResponse(parsed.nonce, RpcErrorCode.BAD_REQUEST, 'Missing sku_id in START_PURCHASE args')
					]
				}
			}

			// Validate SKU exists
			const sku = record.iap_state.skus.find((s) => s.id === skuId)
			if (!sku) {
				return {
					outbound: [
						buildErrorResponse(parsed.nonce, RpcErrorCode.NOT_FOUND, `SKU not found: ${skuId}`)
					]
				}
			}

			// Set pending purchase
			record.pending_purchase = {
				nonce: parsed.nonce,
				sku_id: sku.id,
				sku_name: sku.name,
				sku_price: sku.price,
				created_at: Date.now()
			}

			// Return no outbound yet -- response comes after purchase modal result
			return { outbound: [], _pending_purchase: true }
		}

		default:
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})] }
	}
}
