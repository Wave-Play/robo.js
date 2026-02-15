import type { ActionType, IActionRecorder, RecordedAction, RecordActionOptions } from '../types/index.js'

// Default maximum number of recorded actions before LRU eviction
const DEFAULT_MAX_ACTIONS = 10000

/**
 * ActionRecorder manages recorded actions for a session with memory management.
 * Uses LRU-style eviction to prevent unbounded memory growth.
 */
export class ActionRecorder implements IActionRecorder {
	private actions: RecordedAction[] = []
	private maxActions: number
	private idCounter = 0

	constructor(maxActions: number = DEFAULT_MAX_ACTIONS) {
		this.maxActions = maxActions
	}

	/**
	 * Record a new action
	 */
	record(type: ActionType, data: unknown, options?: RecordActionOptions): RecordedAction {
		const action: RecordedAction = {
			id: `action_${++this.idCounter}`,
			timestamp: Date.now(),
			type,
			data,
			...options
		}

		this.actions.push(action)

		// LRU eviction: remove oldest 10% when at capacity
		if (this.actions.length > this.maxActions) {
			const removeCount = Math.floor(this.maxActions * 0.1)
			this.actions = this.actions.slice(removeCount)
		}

		return action
	}

	/**
	 * Get all recorded actions
	 */
	getAll(): RecordedAction[] {
		return [...this.actions]
	}

	/**
	 * Get actions since a specific timestamp
	 */
	getSince(timestamp: number): RecordedAction[] {
		return this.actions.filter((action) => action.timestamp >= timestamp)
	}

	/**
	 * Get actions by type
	 */
	getByType(type: ActionType): RecordedAction[] {
		return this.actions.filter((action) => action.type === type)
	}

	/**
	 * Get actions by multiple types
	 */
	getByTypes(types: ActionType[]): RecordedAction[] {
		const typeSet = new Set(types)
		return this.actions.filter((action) => typeSet.has(action.type))
	}

	/**
	 * Get message_sent actions
	 */
	getMessagesSent(): RecordedAction[] {
		return this.getByType('message_sent')
	}

	/**
	 * Get message_edited actions
	 */
	getMessagesEdited(): RecordedAction[] {
		return this.getByType('message_edited')
	}

	/**
	 * Get message_deleted actions
	 */
	getMessagesDeleted(): RecordedAction[] {
		return this.getByType('message_deleted')
	}

	/**
	 * Get all interaction response actions
	 */
	getInteractionResponses(): RecordedAction[] {
		return this.getByTypes(['interaction_response', 'interaction_followup', 'interaction_edit'])
	}

	/**
	 * Get all REST request actions
	 */
	getRestRequests(): RecordedAction[] {
		return this.getByTypes([
			'message_sent',
			'message_edited',
			'message_deleted',
			'reaction_added',
			'reaction_removed',
			'interaction_response',
			'interaction_followup',
			'interaction_edit',
			'typing_started',
			'rest_request'
		])
	}

	/**
	 * Get all Gateway WebSocket message actions (client → server)
	 */
	getGatewayMessages(): RecordedAction[] {
		return this.getByTypes([
			'gateway_message',
			'gateway_identify',
			'gateway_heartbeat',
			'gateway_presence_update',
			'gateway_voice_state_update',
			'gateway_resume',
			'gateway_request_guild_members'
		])
	}

	/**
	 * Get dispatch events (server → client)
	 */
	getDispatches(): RecordedAction[] {
		return this.getByType('dispatch')
	}

	/**
	 * Get actions triggered by a specific event
	 */
	getTriggeredBy(eventId: string): RecordedAction[] {
		return this.actions.filter((action) => action.triggeredBy === eventId)
	}

	/**
	 * Get actions for a specific interaction
	 */
	getForInteraction(interactionId: string): RecordedAction[] {
		return this.actions.filter((action) => action.interactionId === interactionId)
	}

	/**
	 * Get all Activity-related actions
	 */
	getActivityActions(): RecordedAction[] {
		return this.getByTypes([
			'activity_launch',
			'activity_close',
			'activity_rpc_inbound',
			'activity_rpc_outbound',
			'activity_proxy_http',
			'activity_proxy_ws'
		])
	}

	/**
	 * Clear all recorded actions
	 */
	clear(): void {
		this.actions = []
		this.idCounter = 0
	}

	/**
	 * Get the number of recorded actions
	 */
	get length(): number {
		return this.actions.length
	}

	/**
	 * Get the maximum number of actions before eviction
	 */
	get maxLength(): number {
		return this.maxActions
	}
}
