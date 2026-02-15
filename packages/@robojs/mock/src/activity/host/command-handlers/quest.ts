import { buildCommandResponse } from '../rpc-envelope.js'
import type { InboundRpcMessage } from '../rpc-envelope.js'
import type { ActivitySessionRecord } from '../activity-session-record.js'
import type { ActivityHostManager, HandleInboundResult } from '../activity-host-manager.js'
import type { RpcCommandDefinition } from '../../schema/manifest-types.js'

/**
 * Quest command handlers.
 * Reads from the session's quest state store and handles QUEST_START_TIMER.
 */
export function handleQuestCommands(
	parsed: InboundRpcMessage,
	record: ActivitySessionRecord,
	_manager: ActivityHostManager,
	_commandDef: RpcCommandDefinition
): HandleInboundResult {
	switch (parsed.cmd) {
		case 'GET_QUEST_ENROLLMENT_STATUS': {
			const args = parsed.args as Record<string, unknown> | undefined
			const questId = args?.quest_id as string | undefined

			// Find matching quest
			let enrollmentStatus = null
			if (questId) {
				const quest = record.quest_state.quests.find((q) => q.id === questId)
				enrollmentStatus = quest?.enrollment_status ?? null
			} else {
				// Return first enrolled quest's status
				const enrolled = record.quest_state.quests.find((q) => q.enrollment_status !== null)
				enrollmentStatus = enrolled?.enrollment_status ?? null
			}

			return {
				outbound: [
					buildCommandResponse(parsed.cmd, parsed.nonce, {
						quest_enrollment_status: enrollmentStatus
					})
				]
			}
		}

		case 'QUEST_START_TIMER': {
			const args = parsed.args as Record<string, unknown> | undefined
			const questId = args?.quest_id as string | undefined

			if (questId) {
				const quest = record.quest_state.quests.find((q) => q.id === questId)
				if (quest?.enrollment_status) {
					quest.enrollment_status.timer_started_at = new Date().toISOString()
				}
			} else {
				// Start timer on first quest with enrollment
				const enrolled = record.quest_state.quests.find((q) => q.enrollment_status !== null)
				if (enrolled?.enrollment_status) {
					enrolled.enrollment_status.timer_started_at = new Date().toISOString()
				}
			}

			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})] }
		}

		default:
			return { outbound: [buildCommandResponse(parsed.cmd, parsed.nonce, {})] }
	}
}
