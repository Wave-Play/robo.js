import type { InboundRpcMessage } from '../rpc-envelope.js'
import { buildCommandResponse, buildEventDispatch } from '../rpc-envelope.js'
import type { ActivitySessionRecord } from '../activity-session-record.js'
import type { ActivityHostManager, HandleInboundResult } from '../activity-host-manager.js'
import type { RpcCommandDefinition } from '../../schema/manifest-types.js'

/**
 * SUBSCRIBE handler.
 *
 * - Parse args.evt (the event name to subscribe to)
 * - If READY not yet emitted, defer the subscription (spec section 14.1)
 * - Register in SubscriptionRegistry (idempotent)
 * - If new subscription on a snapshot_on_subscribe event, emit snapshot
 * - Return { cmd: "SUBSCRIBE", nonce, data: { evt: event_name } }
 */
export function handleSubscribe(
	parsed: InboundRpcMessage,
	record: ActivitySessionRecord,
	manager: ActivityHostManager,
	_commandDef: RpcCommandDefinition
): HandleInboundResult {
	const eventName = parsed.evt ?? (parsed.args?.evt as string) ?? (parsed.args?.event as string) ?? ''
	const subscribeArgs = { ...(parsed.args ?? {}) }
	// Remove the event name key from scoping args
	delete subscribeArgs.evt
	delete subscribeArgs.event

	const outbound: unknown[] = []

	// If READY not yet emitted, defer the subscription
	if (!record.ready_emitted) {
		record.deferred_subscriptions.push({
			event_name: eventName,
			args: subscribeArgs,
			nonce: parsed.nonce
		})
		// Still return a subscription confirmation immediately
		outbound.push(buildCommandResponse('SUBSCRIBE', parsed.nonce, { evt: eventName }))
		return { outbound }
	}

	// Register subscription
	const subs = manager.getSubscriptions(record.instance_id)
	if (subs) {
		const isNew = subs.subscribe(eventName, subscribeArgs)

		// Send subscription confirmation
		outbound.push(buildCommandResponse('SUBSCRIBE', parsed.nonce, { evt: eventName }))

		// Emit snapshot if this is a stateful event and subscription is new
		if (isNew) {
			const snapshot = manager.getSnapshotForEvent(eventName, record)
			if (snapshot !== null) {
				if (Array.isArray(snapshot)) {
					for (const item of snapshot) {
						outbound.push(buildEventDispatch(eventName, item))
					}
				} else {
					outbound.push(buildEventDispatch(eventName, snapshot))
				}
			}
		}
	} else {
		outbound.push(buildCommandResponse('SUBSCRIBE', parsed.nonce, { evt: eventName }))
	}

	return { outbound }
}

/**
 * UNSUBSCRIBE handler.
 *
 * - Parse args.evt
 * - Remove from SubscriptionRegistry
 * - Return { cmd: "UNSUBSCRIBE", nonce, data: { evt: event_name } }
 */
export function handleUnsubscribe(
	parsed: InboundRpcMessage,
	record: ActivitySessionRecord,
	manager: ActivityHostManager,
	_commandDef: RpcCommandDefinition
): HandleInboundResult {
	const eventName = parsed.evt ?? (parsed.args?.evt as string) ?? (parsed.args?.event as string) ?? ''
	const subscribeArgs = { ...(parsed.args ?? {}) }
	delete subscribeArgs.evt
	delete subscribeArgs.event

	const subs = manager.getSubscriptions(record.instance_id)
	if (subs) {
		subs.unsubscribe(eventName, subscribeArgs)
	}

	return {
		outbound: [buildCommandResponse('UNSUBSCRIBE', parsed.nonce, { evt: eventName })]
	}
}
