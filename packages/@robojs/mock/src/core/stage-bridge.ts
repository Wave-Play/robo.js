import { getStageServer } from './stage.js'
import { sessionManager } from './manager.js'
import { NotificationResolver } from '../utils/notification-resolver.js'
import type {
	StageEventType,
	StageMessageCreateData,
	StageInteractionResponseData,
	StageBotReadyData,
	StageBotDisconnectedData,
	StageBotErrorData,
	StageRESTCallData,
	StageEventFilteredData,
	StageLoopDetectedData,
	StageUser,
	StageMentionData
} from '../types/stage.js'
import type { MockUser, MockMessage, SessionLogEntry, PermissionDeniedEvent } from '../types/index.js'

/**
 * Bridge between Session events and the Stage WebSocket server.
 * Acts as an observer that forwards events from the mock server to connected Stage clients.
 */
export class StageBridge {
	private sequenceCounters: Map<string, number> = new Map()  // sessionId -> seq

	/**
	 * Called when Session.dispatch() fires an event.
	 * Maps Discord events to Stage events and broadcasts to connected clients.
	 *
	 * @param sessionId - The session that dispatched the event
	 * @param event - The Discord event name (e.g., "MESSAGE_CREATE")
	 * @param data - The event payload
	 */
	onSessionDispatch(sessionId: string, event: string, data: unknown): void {
		const stageEventType = this.mapEventType(event)
		if (!stageEventType) {
			// Event not relevant to stage clients
			return
		}

		const stageData = this.transformEventData(event, data, sessionId)
		const stageServer = getStageServer()
		stageServer.broadcastToSession(sessionId, {
			type: stageEventType,
			data: stageData
		})
	}

	/**
	 * Called when a bot sends an interaction response.
	 *
	 * @param sessionId - The session
	 * @param interactionId - The interaction that was responded to
	 * @param response - The response data
	 * @param channelId - Optional channel ID for deferred responses
	 * @param bot - Optional bot info for deferred responses
	 */
	onInteractionResponse(
		sessionId: string,
		interactionId: string,
		response: unknown,
		channelId?: string,
		bot?: { id?: string; username?: string; avatar?: string | null }
	): void {
		const stageData: StageInteractionResponseData = {
			interactionId,
			response,
			channelId,
			bot
		}

		const stageServer = getStageServer()
		stageServer.broadcastToSession(sessionId, {
			type: 'interaction_response',
			data: stageData
		})
	}

	/**
	 * Called when a bot sends an interaction followup message.
	 *
	 * @param sessionId - The session
	 * @param interactionId - The original interaction
	 * @param message - The followup message
	 */
	onInteractionFollowup(sessionId: string, interactionId: string, message: unknown): void {
		const stageServer = getStageServer()
		stageServer.broadcastToSession(sessionId, {
			type: 'interaction_followup',
			data: {
				interactionId,
				message
			}
		})
	}

	/**
	 * Called when a bot edits an interaction message (e.g., editReply after deferReply).
	 * This clears the "Bot is thinking..." indicator.
	 *
	 * @param sessionId - The session
	 * @param interactionId - The interaction that was edited
	 */
	onInteractionEdit(sessionId: string, interactionId: string): void {
		const stageServer = getStageServer()
		stageServer.broadcastToSession(sessionId, {
			type: 'interaction_edit',
			data: {
				interactionId
			}
		})
	}

	/**
	 * Called when a bot connects and receives READY event.
	 *
	 * @param sessionId - The session
	 * @param botUser - The bot user that connected
	 * @param connectionId - The gateway connection ID
	 */
	onBotReady(sessionId: string, botUser: MockUser, connectionId: string): void {
		const stageData: StageBotReadyData = {
			user: this.toStageUser(botUser),
			connectionId
		}

		const stageServer = getStageServer()
		stageServer.broadcastToSession(sessionId, {
			type: 'bot_ready',
			data: stageData
		})

		// Defensive recovery: refresh state after a delay to catch commands registered during startup
		// Commands are typically registered via REST API shortly after READY, so this ensures
		// Stage UI has the updated command list even if there was a race condition
		setTimeout(() => {
			stageServer.refreshSessionState(sessionId)
		}, 500)
	}

	/**
	 * Called when a bot's gateway connection closes.
	 *
	 * @param sessionId - The session
	 * @param connectionId - The gateway connection ID that closed
	 * @param code - WebSocket close code
	 * @param reason - Close reason
	 */
	onBotDisconnected(sessionId: string, connectionId: string, code?: number, reason?: string): void {
		const stageData: StageBotDisconnectedData = {
			connectionId,
			code,
			reason
		}

		const stageServer = getStageServer()
		stageServer.broadcastToSession(sessionId, {
			type: 'bot_disconnected',
			data: stageData
		})
	}

	/**
	 * Called when a bot encounters an error.
	 *
	 * @param sessionId - The session
	 * @param error - The error message
	 * @param connectionId - Optional connection ID
	 */
	onBotError(sessionId: string, error: string, connectionId?: string): void {
		const stageData: StageBotErrorData = {
			error,
			connectionId
		}

		const stageServer = getStageServer()
		stageServer.broadcastToSession(sessionId, {
			type: 'bot_error',
			data: stageData
		})
	}

	/**
	 * Called when typing starts in a channel.
	 *
	 * @param sessionId - The session
	 * @param channelId - The channel where typing started
	 * @param userId - The user who started typing
	 */
	onTypingStart(sessionId: string, channelId: string, userId: string, user?: MockUser): void {
		const stageServer = getStageServer()
		stageServer.broadcastToSession(sessionId, {
			type: 'typing_start',
			data: {
				channel_id: channelId,
				user_id: userId,
				user: user ? this.toStageUser(user) : undefined
			}
		})
	}

	/**
	 * Called when a REST API call is made.
	 *
	 * @param sessionId - The session
	 * @param data - REST call data including method, path, status, duration
	 */
	onRESTCall(sessionId: string, data: StageRESTCallData): void {
		const stageServer = getStageServer()
		stageServer.broadcastToSession(sessionId, {
			type: 'rest_call',
			data
		})
	}

	/**
	 * Called when an event is filtered due to missing intent.
	 * Notifies Stage UI so developers can see why events aren't reaching their bot.
	 *
	 * @param sessionId - The session
	 * @param connectionId - The gateway connection ID
	 * @param eventName - The event that was filtered (e.g., "MESSAGE_CREATE")
	 * @param requiredIntent - The intent required to receive this event (e.g., "GuildMessages")
	 * @param timestamp - When the event was filtered (for playback sync)
	 */
	onEventFiltered(
		sessionId: string,
		connectionId: string,
		eventName: string,
		requiredIntent: string | null,
		timestamp: number
	): void {
		const stageData: StageEventFilteredData = {
			connectionId,
			eventName,
			requiredIntent,
			message: `${eventName} not delivered (missing ${requiredIntent} intent)`,
			timestamp
		}

		const stageServer = getStageServer()
		stageServer.broadcastToSession(sessionId, {
			type: 'event_filtered',
			data: stageData
		})
	}

	/**
	 * Called when an event loop is detected and circuit breaker triggered.
	 * Notifies Stage UI so developers can see what happened.
	 *
	 * @param sessionId - The session
	 * @param data - Loop detection details
	 */
	onLoopDetected(sessionId: string, data: StageLoopDetectedData): void {
		const stageServer = getStageServer()
		stageServer.broadcastToSession(sessionId, {
			type: 'loop_detected',
			data
		})
	}

	/**
	 * Called when a log entry is recorded from a connected bot.
	 * Streams the log to Stage UI for real-time display in the Logs Panel.
	 *
	 * @param sessionId - The session
	 * @param logEntry - The log entry to broadcast
	 */
	onLogEntry(sessionId: string, logEntry: SessionLogEntry): void {
		const stageServer = getStageServer()
		stageServer.broadcastToSession(sessionId, {
			type: 'log_entry',
			data: logEntry
		})
	}

	/**
	 * Called when a permission check fails.
	 * Broadcasts to Stage UI for display in the Permissions Panel.
	 *
	 * @param sessionId - The session
	 * @param event - The permission denied event details
	 */
	onPermissionDenied(sessionId: string, event: PermissionDeniedEvent): void {
		const stageServer = getStageServer()
		stageServer.broadcastToSession(sessionId, {
			type: 'permission_denied',
			data: event
		})
	}

	/**
	 * Map Discord event names to Stage event types.
	 * Returns null for events that shouldn't be forwarded to stage.
	 */
	private mapEventType(discordEvent: string): StageEventType | null {
		switch (discordEvent) {
			// Message events
			case 'MESSAGE_CREATE':
				return 'message_create'
			case 'MESSAGE_UPDATE':
				return 'message_update'
			case 'MESSAGE_DELETE':
				return 'message_delete'

			// Interaction events
			case 'INTERACTION_CREATE':
				return 'interaction_create'

			// Typing
			case 'TYPING_START':
				return 'typing_start'

			// Presence
			case 'PRESENCE_UPDATE':
				return 'presence_update'

			// Reactions
			case 'MESSAGE_REACTION_ADD':
				return 'message_reaction_add'
			case 'MESSAGE_REACTION_REMOVE':
				return 'message_reaction_remove'

			// Channel events
			case 'CHANNEL_CREATE':
				return 'channel_create'
			case 'CHANNEL_UPDATE':
				return 'channel_update'

			// Guild events
			case 'GUILD_EMOJIS_UPDATE':
				return 'guild_emojis_update'

			// We don't forward GUILD_CREATE, READY, etc. - those are internal gateway events
			default:
				return null
		}
	}

	/**
	 * Transform Discord event data to Stage format.
	 * Adds source information and simplifies where needed.
	 */
	private transformEventData(event: string, data: unknown, sessionId?: string): unknown {
		switch (event) {
			case 'MESSAGE_CREATE': {
				const messageData = data as { author?: { id?: string; bot?: boolean }; mentions?: Array<{ id: string }>; mention_roles?: string[]; mention_everyone?: boolean; content?: string; [key: string]: unknown }
				const source = messageData.author?.bot ? 'bot' : 'injected'

				// Compute mention metadata for Stage UI
				let mentions: StageMentionData | undefined
				if (sessionId) {
					const session = sessionManager.get(sessionId)
					if (session) {
						const currentUser = session.state.currentUser
						// Build a minimal MockMessage for NotificationResolver
						const mockMessage: MockMessage = {
							id: (messageData.id as string) ?? '',
							channelId: (messageData.channel_id as string) ?? '',
							authorId: (messageData.author?.id as string) ?? '',
							content: messageData.content ?? '',
							timestamp: new Date().toISOString(),
							editedTimestamp: null,
							tts: false,
							mentionEveryone: messageData.mention_everyone ?? false,
							mentions: (messageData.mentions as Array<{ id: string }> ?? []).map(m => m.id),
							mentionRoles: (messageData.mention_roles as string[]) ?? [],
							attachments: [],
							embeds: [],
							pinned: false,
							type: 0
						}

						const notificationResult = NotificationResolver.resolve(mockMessage, session.state, currentUser?.id)
						mentions = {
							mentionsCurrentUser: notificationResult.mentionsCurrentUser,
							mentionsEveryone: notificationResult.mentionsEveryone,
							mentionsHere: notificationResult.mentionsHere,
							mentionedRoles: notificationResult.mentionedRoles,
							mentionedChannels: notificationResult.mentionedChannels
						}
					}
				}

				return {
					source,
					message: data,
					mentions
				} as StageMessageCreateData
			}

			case 'MESSAGE_UPDATE':
			case 'MESSAGE_DELETE':
				return { message: data }

			case 'INTERACTION_CREATE':
				return { interaction: data }

			case 'TYPING_START':
			case 'PRESENCE_UPDATE':
			default:
				return data
		}
	}

	/**
	 * Convert MockUser to StageUser
	 */
	private toStageUser(user: MockUser): StageUser {
		return {
			id: user.id,
			username: user.username,
			discriminator: user.discriminator,
			avatar: user.avatar ?? null,
			bot: user.bot
		}
	}

	/**
	 * Reset sequence counter for a session (call when session is deleted)
	 */
	resetSessionSequence(sessionId: string): void {
		this.sequenceCounters.delete(sessionId)
	}
}

/**
 * Singleton stage bridge instance
 */
let _stageBridge: StageBridge | null = null

/**
 * Get or create the stage bridge singleton
 */
export function getStageBridge(): StageBridge {
	if (!_stageBridge) {
		_stageBridge = new StageBridge()
	}
	return _stageBridge
}

/**
 * Reset the stage bridge singleton (for testing)
 */
export function resetStageBridge(): void {
	_stageBridge = null
}
