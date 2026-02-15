import type { InboundRpcMessage } from '../rpc-envelope.js'
import type { ActivitySessionRecord } from '../activity-session-record.js'
import type { ActivityHostManager, HandleInboundResult } from '../activity-host-manager.js'
import type { RpcCommandDefinition } from '../../schema/manifest-types.js'
import { buildCommandResponse } from '../rpc-envelope.js'

// Import individual handler modules
import { handleSubscribe, handleUnsubscribe } from './subscription.js'
import { handleContextCommands } from './context.js'
import { handleAuthorize, handleAuthenticate } from './auth.js'
import { handleActivityCommands } from './activity.js'
import { handleUiCommands } from './ui.js'
import { handlePlatformCommands } from './platform.js'
import { handleIapCommands } from './iap.js'
import { handleSocialCommands } from './social.js'
import { handleAnalyticsCommands } from './analytics.js'
import { handleQuestCommands } from './quest.js'

/**
 * Command handler function signature.
 * Returns outbound messages to send to the Activity.
 */
export type CommandHandler = (
	parsed: InboundRpcMessage,
	record: ActivitySessionRecord,
	manager: ActivityHostManager,
	commandDef: RpcCommandDefinition
) => HandleInboundResult

/**
 * Dispatch a command to the appropriate handler.
 * SUBSCRIBE/UNSUBSCRIBE are special-cased; all others dispatch by category
 * or name to module-level handlers.
 */
export function dispatchCommand(
	parsed: InboundRpcMessage,
	record: ActivitySessionRecord,
	manager: ActivityHostManager,
	commandDef: RpcCommandDefinition
): HandleInboundResult {
	// Special: SUBSCRIBE / UNSUBSCRIBE
	if (parsed.cmd === 'SUBSCRIBE') {
		return handleSubscribe(parsed, record, manager, commandDef)
	}
	if (parsed.cmd === 'UNSUBSCRIBE') {
		return handleUnsubscribe(parsed, record, manager, commandDef)
	}

	// Special: AUTH commands
	if (parsed.cmd === 'AUTHORIZE') {
		return handleAuthorize(parsed, record, manager, commandDef)
	}
	if (parsed.cmd === 'AUTHENTICATE') {
		return handleAuthenticate(parsed, record, manager, commandDef)
	}

	// SET_ACTIVITY special case (category may be 'platform' but handled separately)
	if (parsed.cmd === 'SET_ACTIVITY') {
		return handleActivityCommands(parsed, record, manager, commandDef)
	}

	// Dispatch by category
	switch (commandDef.category) {
		case 'context':
			return handleContextCommands(parsed, record, manager, commandDef)
		case 'platform':
		case 'voice':
			return handlePlatformCommands(parsed, record, manager, commandDef)
		case 'ui':
			return handleUiCommands(parsed, record, manager, commandDef)
		case 'iap':
			return handleIapCommands(parsed, record, manager, commandDef)
		case 'social':
			return handleSocialCommands(parsed, record, manager, commandDef)
		case 'analytics':
			return handleAnalyticsCommands(parsed, record, manager, commandDef)
		case 'quest':
			return handleQuestCommands(parsed, record, manager, commandDef)
		default:
			break
	}

	// Fallback: void response for unknown-but-manifest-listed commands
	return {
		outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, null)]
	}
}
