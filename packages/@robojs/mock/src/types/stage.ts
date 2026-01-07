import type { Snowflake } from 'discord-api-types/v10'

// ============================================================================
// Stage WebSocket Protocol Types
// Phase 5A: Real-time event streaming for test clients
// ============================================================================

/**
 * Event types sent from server to stage clients
 */
export type StageEventType =
	// Connection lifecycle
	| 'connected'              // Initial connection established
	| 'state_sync'             // Full state on connect
	| 'current_user_update'    // Current user updated
	| 'command_response'       // Response to a command

	// Message events
	| 'message_create'         // New message (from user or bot)
	| 'message_update'         // Message edited
	| 'message_delete'         // Message deleted
	| 'message_reaction_add'   // Reaction added to message
	| 'message_reaction_remove' // Reaction removed from message

	// Interaction events
	| 'interaction_create'     // Slash command, button, etc. invoked
	| 'interaction_response'   // Bot responded to interaction
	| 'interaction_followup'   // Bot sent followup message
	| 'interaction_edit'       // Bot edited interaction message (Phase 5O)

	// Typing & presence
	| 'typing_start'           // User started typing
	| 'presence_update'        // User status changed

	// Voice (Phase 5P)
	| 'voice_state_update'     // User joined/left/updated voice channel

	// Guild/Channel events
	| 'channel_update'         // Channel was updated
	| 'guild_emojis_update'    // Guild emojis were updated

	// Bot lifecycle
	| 'bot_ready'              // Bot connected and ready
	| 'bot_disconnected'       // Bot disconnected
	| 'bot_error'              // Bot encountered error
	| 'commands_updated'       // Bot commands were registered/updated

	// System
	| 'heartbeat'              // Keep-alive (every 30s)
	| 'error'                  // Error occurred
	| 'session_invalid'        // Session token is stale/expired
	| 'control_action'         // Control action performed

	// REST API (Phase 5K)
	| 'rest_call'              // REST API call made by bot

	// Diagnostics
	| 'event_filtered'         // Event was not delivered due to missing intent
	| 'loop_detected'          // Event loop detected, circuit breaker triggered
	| 'log_entry'              // Log entry from bot process
	| 'permission_denied'      // Permission denied for an action

/**
 * Command types sent from stage clients to server
 */
export type StageCommandType =
	| 'send_message'           // Send a message as a user
	| 'invoke_command'         // Invoke slash command
	| 'invoke_context_command' // Invoke context menu command (right-click)
	| 'click_button'           // Click a button
	| 'select_option'          // Select from dropdown
	| 'submit_modal'           // Submit modal form
	| 'add_reaction'           // Add reaction to message
	| 'remove_reaction'        // Remove reaction from message
	| 'start_typing'           // Show typing indicator
	| 'request_state'          // Request current state
	| 'set_playback'           // Control playback (play/pause/seek)
	| 'subscribe_channel'      // Subscribe to channel updates
	| 'set_current_user'       // Set the current user for the session
	| 'switch_user'            // Switch to a different user
	// Voice (Phase 5P)
	| 'join_voice'             // Join a voice channel
	| 'leave_voice'            // Leave voice channel
	| 'update_voice_state'     // Update mute/deaf state

// ============================================================================
// Stage Event Payloads
// ============================================================================

/**
 * Event envelope sent from server to stage client
 */
export interface StageEvent {
	/** Monotonic sequence number for reconnection replay */
	seq: number
	/** Unix timestamp in milliseconds */
	timestamp: number
	/** Event type */
	type: StageEventType
	/** Event-specific data */
	data: unknown
}

/**
 * Full state sync payload sent on connection
 */
export interface StateSyncPayload {
	session: {
		id: string
		createdAt: number
		bot: StageUser | null
	}
	guilds: StageGuild[]
	channels: StageChannel[]
	members: StageMember[]
	roles: StageRole[]  // Phase 5H: Guild roles
	messages: Record<string, StageMessage[]>  // channelId -> messages
	users: StageUser[]
	commands: StageApplicationCommand[]  // Phase 5G: Available slash commands
	voice_states: StageVoiceState[]  // Phase 5P: Voice channel states
	currentUser?: StageUser
}

/**
 * Simplified guild data for stage clients
 */
export interface StageGuild {
	id: Snowflake
	name: string
	icon: string | null
	owner_id?: Snowflake
	member_count?: number
}

/**
 * Simplified channel data for stage clients
 */
export interface StageChannel {
	id: Snowflake
	name: string
	type: number
	guild_id?: Snowflake
	parent_id?: Snowflake | null
	position?: number
	topic?: string | null
	// Thread-specific fields (types 10, 11, 12)
	thread_metadata?: {
		archived: boolean
		auto_archive_duration: number
		archive_timestamp: string
		locked: boolean
	}
	message_count?: number
	owner_id?: Snowflake
}

/**
 * Activity data for stage clients (custom status, game, streaming, etc.)
 */
export interface StageActivity {
	name: string
	type: number // 0=Playing, 1=Streaming, 2=Listening, 3=Watching, 4=Custom, 5=Competing
	state?: string // Custom status text
	url?: string // Streaming URL
}

/**
 * Simplified user data for stage clients
 */
export interface StageUser {
	id: Snowflake
	username: string
	global_name?: string
	discriminator?: string
	avatar: string | null
	bot?: boolean
	status?: 'online' | 'offline' | 'idle' | 'dnd'
	activities?: StageActivity[]
}

/**
 * Simplified member data for stage clients
 */
export interface StageMember {
	user: StageUser
	nick?: string | null
	roles: Snowflake[]
	joined_at?: string
	guild_id: Snowflake
}

/**
 * Simplified role data for stage clients (Phase 5H)
 */
export interface StageRole {
	id: Snowflake
	name: string
	color: number  // RGB integer (0 = no color)
	position: number
	guild_id: Snowflake
	hoist: boolean  // Whether to show separately in member list
}

/**
 * Simplified voice state data for stage clients (Phase 5P)
 */
export interface StageVoiceState {
	guild_id: Snowflake
	channel_id: Snowflake | null // null when leaving voice
	user_id: Snowflake
	self_mute: boolean
	self_deaf: boolean
	mute: boolean // Server mute
	deaf: boolean // Server deaf
	self_stream?: boolean
	self_video?: boolean
	speaking?: boolean // Simulated speaking indicator (Phase 5P)
	member?: StageMember
}

/**
 * Reaction data for stage clients (matches Discord API structure)
 */
export interface StageReaction {
	count: number
	me: boolean
	emoji: {
		id: string | null
		name: string | null
	}
}

/**
 * Simplified message data for stage clients
 */
export interface StageMessage {
	id: Snowflake
	channel_id: Snowflake
	guild_id?: Snowflake
	author: StageUser
	content: string
	timestamp: string
	edited_timestamp?: string | null
	embeds: unknown[]
	components: unknown[]
	attachments: unknown[]
	reactions?: StageReaction[]
	flags?: number  // Message flags (64 = EPHEMERAL)
	pinned?: boolean  // Whether message is pinned
	type?: number  // Message type (0=DEFAULT, 7=GUILD_MEMBER_JOIN, etc.)
	message_reference?: {  // Reference for reply messages
		message_id?: Snowflake
		channel_id?: Snowflake
		guild_id?: Snowflake
	}
	interaction_metadata?: {
		id: Snowflake
		type: number
		user: StageUser
		authorizing_integration_owners?: Record<number, Snowflake>
		original_response_message_id?: Snowflake
		target_user?: StageUser
		target_message_id?: Snowflake
	}
	interaction?: {
		id: Snowflake
		type: number
		name?: string
		user: StageUser
	}
}

// ============================================================================
// Phase 5G: Application Command Types for Stage UI
// ============================================================================

/**
 * Application command option choice for stage clients
 */
export interface StageApplicationCommandOptionChoice {
	name: string
	value: string | number
}

/**
 * Application command option for stage clients
 */
export interface StageApplicationCommandOption {
	/** Option type (1=SubCommand, 2=SubCommandGroup, 3=String, 4=Integer, 5=Boolean, 6=User, 7=Channel, 8=Role, 9=Mentionable, 10=Number, 11=Attachment) */
	type: number
	name: string
	description: string
	required?: boolean
	choices?: StageApplicationCommandOptionChoice[]
	options?: StageApplicationCommandOption[] // For subcommands
	channel_types?: number[]
	min_value?: number
	max_value?: number
	min_length?: number
	max_length?: number
	autocomplete?: boolean
}

/**
 * Simplified application command for stage clients
 */
export interface StageApplicationCommand {
	id: Snowflake
	name: string
	description: string
	/** Command type (1=ChatInput, 2=User, 3=Message) */
	type: number
	options?: StageApplicationCommandOption[]
}

/**
 * Message source indicator for stage events
 */
export type StageMessageSource = 'bot' | 'injected' | 'system'

/**
 * Data payload for message_create events
 */
export interface StageMessageCreateData {
	source: StageMessageSource
	message: StageMessage
}

/**
 * Data payload for interaction_response events
 */
export interface StageInteractionResponseData {
	interactionId: Snowflake
	response: unknown
	// Phase 5O: Additional fields for "Bot is thinking..." indicator
	channelId?: Snowflake
	bot?: {
		id?: string
		username?: string
		avatar?: string | null
	}
}

/**
 * Data payload for bot_ready events
 */
export interface StageBotReadyData {
	user: StageUser
	connectionId: string
}

/**
 * Data payload for bot_disconnected events
 */
export interface StageBotDisconnectedData {
	connectionId: string
	code?: number
	reason?: string
}

/**
 * Data payload for bot_error events
 */
export interface StageBotErrorData {
	error: string
	connectionId?: string
}

/**
 * Data payload for command_response events
 */
export interface StageCommandResponseData {
	command_id: string
	success: boolean
	result?: unknown
	error?: string
}

/**
 * Data payload for rest_call events (Phase 5K)
 */
export interface StageRESTCallData {
	/** HTTP method */
	method: string
	/** Request path (e.g., /api/v10/channels/123/messages) */
	path: string
	/** HTTP status code */
	statusCode: number
	/** Request duration in milliseconds */
	duration: number
	/** Request body (for POST/PATCH/PUT) */
	requestBody?: unknown
	/** Response body */
	responseBody?: unknown
	/** Timestamp when request started */
	timestamp: number
	/** Friendly endpoint name (e.g., "POST /channels/:id/messages") */
	endpoint?: string
	/** Error message if request failed */
	error?: string
}

/**
 * Data payload for event_filtered events
 * Sent when an event is not delivered to a bot due to missing intent
 */
export interface StageEventFilteredData {
	/** The gateway connection ID */
	connectionId: string
	/** The event that was filtered (e.g., "MESSAGE_CREATE") */
	eventName: string
	/** The intent required to receive this event (e.g., "GuildMessages") */
	requiredIntent: string | null
	/** Human-readable message */
	message: string
	/** Timestamp when the event was filtered (for playback sync) */
	timestamp: number
}

/**
 * Data payload for loop_detected events
 * Sent when an event loop is detected and the circuit breaker is triggered
 */
export interface StageLoopDetectedData {
	/** The event type that triggered the loop (e.g., "MESSAGE_CREATE") */
	eventType: string
	/** Number of events that triggered the detection */
	count: number
	/** Time window in milliseconds */
	windowMs: number
	/** Cooldown duration in milliseconds */
	cooldownMs: number
	/** Last message author ID (if available) */
	lastAuthorId: string | null
	/** Last message author username (if available) */
	lastAuthorUsername: string | null
	/** Last message content snippet (if available) */
	lastContent: string | null
	/** Timestamp when the loop was detected */
	timestamp: number
}

// ============================================================================
// Stage Command Payloads
// ============================================================================

/**
 * Command envelope sent from stage client to server
 */
export interface StageCommand {
	/** Unique ID for response correlation */
	id: string
	/** Command type */
	type: StageCommandType
	/** Command-specific data */
	data: unknown
}

/**
 * Data for send_message command
 */
export interface StageSendMessageData {
	channel_id: Snowflake
	content: string
	author?: {
		id?: Snowflake
		username?: string
	}
	embeds?: unknown[]
	components?: unknown[]
	message_reference?: {
		message_id?: Snowflake
		channel_id?: Snowflake
		guild_id?: Snowflake
	}
}

/**
 * Data for invoke_command command
 */
export interface StageInvokeCommandData {
	channel_id: Snowflake
	command_name: string
	options?: Record<string, unknown>
	user?: {
		id?: Snowflake
		username?: string
	}
}

/**
 * Data for invoke_context_command command (Phase 5N)
 */
export interface StageInvokeContextCommandData {
	channel_id: Snowflake
	command_name: string
	/** 2 = USER, 3 = MESSAGE */
	command_type: 2 | 3
	target_id: Snowflake
	/** For message commands, the target message */
	message?: StageMessage
	/** For user commands, the target user */
	user?: StageUser
}

/**
 * Data for click_button command
 */
export interface StageClickButtonData {
	channel_id: Snowflake
	message_id: Snowflake
	custom_id: string
	user?: {
		id?: Snowflake
		username?: string
	}
}

/**
 * Data for select_option command
 */
export interface StageSelectOptionData {
	channel_id: Snowflake
	message_id: Snowflake
	custom_id: string
	values: string[]
	user?: {
		id?: Snowflake
		username?: string
	}
}

/**
 * Data for submit_modal command
 */
export interface StageSubmitModalData {
	custom_id: string
	components: unknown[]
	user?: {
		id?: Snowflake
		username?: string
	}
}

/**
 * Data for add_reaction command
 */
export interface StageAddReactionData {
	channel_id: Snowflake
	message_id: Snowflake
	emoji: string  // Unicode emoji or custom emoji string
	user?: {
		id?: Snowflake
		username?: string
	}
}

/**
 * Data for remove_reaction command
 */
export interface StageRemoveReactionData {
	channel_id: Snowflake
	message_id: Snowflake
	emoji: string  // Unicode emoji or custom emoji string
	user?: {
		id?: Snowflake
		username?: string
	}
}

/**
 * Data for start_typing command
 */
export interface StageStartTypingData {
	channel_id: Snowflake
	user?: {
		id?: Snowflake
		username?: string
	}
}

/**
 * Data for subscribe_channel command
 */
export interface StageSubscribeChannelData {
	channel_id: Snowflake
	subscribe: boolean
}

/**
 * Data for set_playback command (Phase 5J)
 */
export interface StageSetPlaybackData {
	action: 'play' | 'pause' | 'seek' | 'stop'
	position?: number // For seek, in milliseconds
	speed?: number // Playback speed multiplier
}

/**
 * Data for join_voice command (Phase 5P)
 */
export interface StageJoinVoiceData {
	channel_id: Snowflake
	guild_id: Snowflake
	self_mute?: boolean
	self_deaf?: boolean
	user?: {
		id?: Snowflake
		username?: string
	}
}

/**
 * Data for leave_voice command (Phase 5P)
 */
export interface StageLeaveVoiceData {
	guild_id: Snowflake
	user?: {
		id?: Snowflake
		username?: string
	}
}

/**
 * Data for update_voice_state command (Phase 5P)
 */
export interface StageUpdateVoiceStateData {
	guild_id: Snowflake
	self_mute?: boolean
	self_deaf?: boolean
	user?: {
		id?: Snowflake
		username?: string
	}
}

// ============================================================================
// Stage Connection State
// ============================================================================

/**
 * State for a connected stage client
 */
export interface StageConnectionState {
	/** Unique connection ID */
	id: string
	/** Session this connection belongs to */
	sessionId: string
	/** Whether connection has been authenticated */
	authenticated: boolean
	/** Last sequence number sent to this client */
	lastSeq: number
	/** Channels this client is subscribed to (for filtering) */
	subscribedChannels: Set<string>
	/** When this connection was established */
	connectedAt: number
}

/**
 * Buffered event for reconnection replay
 */
export interface BufferedStageEvent {
	/** Session ID this event belongs to */
	sessionId: string
	/** The event itself */
	event: StageEvent
	/** When this event was buffered */
	bufferedAt: number
}

// ============================================================================
// Stage Server Configuration
// ============================================================================

/**
 * Configuration for the Stage WebSocket server
 */
export interface StageServerConfig {
	/** Maximum events to buffer per session for reconnection (default: 1000) */
	maxBufferSize?: number
	/** Heartbeat interval in milliseconds (default: 30000) */
	heartbeatInterval?: number
	/** Maximum messages to include in state sync per channel (default: 50) */
	maxMessagesPerChannel?: number
}
