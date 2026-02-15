import { mockLogger } from '../../../core/logger.js'
import { buildCommandResponse } from '../rpc-envelope.js'
import type { InboundRpcMessage } from '../rpc-envelope.js'
import type { ActivitySessionRecord } from '../activity-session-record.js'
import type { ActivityHostManager, HandleInboundResult } from '../activity-host-manager.js'
import type { RpcCommandDefinition } from '../../schema/manifest-types.js'

/**
 * Platform and voice command handlers.
 */
export function handlePlatformCommands(
	parsed: InboundRpcMessage,
	record: ActivitySessionRecord,
	_manager: ActivityHostManager,
	_commandDef: RpcCommandDefinition
): HandleInboundResult {
	switch (parsed.cmd) {
		case 'GET_PLATFORM_BEHAVIORS':
			return {
				outbound: [
					buildCommandResponse(parsed.cmd, parsed.nonce, {
						iosKeyboardResizesView: true,
						requiresHardwareAcceleration: false,
						supportsPopouts: true,
						supportsOrientationLock: true
					})
				]
			}

		case 'ENCOURAGE_HW_ACCELERATION':
			return {
				outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, { enabled: true })]
			}

		case 'SET_CONFIG':
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})] }

		case 'USER_SETTINGS_GET_LOCALE':
			return {
				outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, { locale: record.locale })]
			}

		case 'SET_ORIENTATION_LOCK_STATE': {
			const lockState = parsed.args?.lock_state
			mockLogger.debug(`Activity SET_ORIENTATION_LOCK_STATE: ${lockState}`)
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})] }
		}

		case 'SET_CERTIFIED_DEVICES':
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})] }

		case 'CAPTURE_SHORTCUT':
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})] }

		case 'SELECT_VOICE_CHANNEL':
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, { channel: null })] }

		case 'SELECT_TEXT_CHANNEL':
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, { channel: null })] }

		default:
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})] }
	}
}
