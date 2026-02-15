import { mockLogger } from '../../../core/logger.js'
import { buildCommandResponse } from '../rpc-envelope.js'
import type { InboundRpcMessage } from '../rpc-envelope.js'
import type { ActivitySessionRecord } from '../activity-session-record.js'
import type { ActivityHostManager, HandleInboundResult } from '../activity-host-manager.js'
import type { RpcCommandDefinition } from '../../schema/manifest-types.js'

/**
 * UI command handlers.
 * These commands trigger Stage UI affordances in later phases.
 * For Phase 2, they return void responses.
 */
export function handleUiCommands(
	parsed: InboundRpcMessage,
	_record: ActivitySessionRecord,
	_manager: ActivityHostManager,
	_commandDef: RpcCommandDefinition
): HandleInboundResult {
	switch (parsed.cmd) {
		case 'OPEN_EXTERNAL_LINK': {
			const url = parsed.args?.url as string
			if (url) {
				mockLogger.debug(`Activity OPEN_EXTERNAL_LINK: ${url}`)
			}
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})] }
		}

		case 'SHARE_LINK': {
			const url = parsed.args?.url as string
			if (url) {
				mockLogger.debug(`Activity SHARE_LINK: ${url}`)
			}
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, { success: true })] }
		}

		case 'OPEN_INVITE_DIALOG':
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})] }

		case 'INVITE_USER_EMBEDDED':
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})] }

		case 'OPEN_SHARE_MOMENT_DIALOG':
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})] }

		case 'SHARE_INTERACTION':
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})] }

		case 'INITIATE_IMAGE_UPLOAD':
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, { image_url: '' })] }

		default:
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})] }
	}
}
