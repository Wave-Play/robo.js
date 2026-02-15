import type { Snowflake } from 'discord-api-types/v10'
import type { ScenarioStepResultSummary } from './index.js'

// ============================================================================
// Stage WebSocket Protocol Types
// Real-time event streaming for test clients
// ============================================================================

/**
 * Event types sent from server to stage clients
 */
export type StageEventType =
	// Connection lifecycle
	| 'connected' // Initial connection established
	| 'state_sync' // Full state on connect
	| 'current_user_update' // Current user updated
	| 'command_response' // Response to a command

	// Message events
	| 'message_create' // New message (from user or bot)
	| 'message_update' // Message edited
	| 'message_delete' // Message deleted
	| 'message_reaction_add' // Reaction added to message
	| 'message_reaction_remove' // Reaction removed from message

	// Interaction events
	| 'interaction_create' // Slash command, button, etc. invoked
	| 'interaction_response' // Bot responded to interaction
	| 'interaction_followup' // Bot sent followup message
	| 'interaction_edit' // Bot edited interaction message

	// Typing & presence
	| 'typing_start' // User started typing
	| 'presence_update' // User status changed

	// Voice
	| 'voice_state_update' // User joined/left/updated voice channel

	// Guild/Channel events
	| 'channel_create' // Channel was created
	| 'channel_update' // Channel was updated
	| 'guild_emojis_update' // Guild emojis were updated

	// Bot lifecycle
	| 'bot_ready' // Bot connected and ready
	| 'bot_disconnected' // Bot disconnected
	| 'bot_error' // Bot encountered error
	| 'commands_updated' // Bot commands were registered/updated

	// System
	| 'heartbeat' // Keep-alive (every 30s)
	| 'error' // Error occurred
	| 'session_invalid' // Session token is stale/expired
	| 'control_action' // Control action performed

	// REST API
	| 'rest_call' // REST API call made by bot

	// Diagnostics
	| 'event_filtered' // Event was not delivered due to missing intent
	| 'loop_detected' // Event loop detected, circuit breaker triggered
	| 'log_entry' // Log entry from bot process
	| 'permission_denied' // Permission denied for an action

	// Simulation events (Simulation Support)
	| 'scenario.step.started' // Scenario step execution started
	| 'scenario.step.completed' // Scenario step completed successfully
	| 'scenario.step.failed' // Scenario step failed
	| 'scenario.run.idle' // Scenario run idle (no scenario loaded)
	| 'scenario.run.loaded' // Scenario loaded, ready to start
	| 'scenario.run.started' // Scenario run started
	| 'scenario.run.running' // Scenario actively running
	| 'scenario.run.paused' // Scenario run paused
	| 'scenario.run.resumed' // Scenario run resumed
	| 'scenario.run.stopped' // Scenario run stopped by user
	| 'scenario.run.completed' // Scenario run completed (all steps done)
	| 'scenario.run.failed' // Scenario run failed (assertion failures)
	| 'scenario.run.error' // Scenario run fatal error (not resumable)
	| 'stage.playback.changed' // Playback state changed (mode, position, etc.)
	| 'stage.navigation.changed' // Navigation state changed (guild, channel)
	| 'control_command' // Server-initiated control command

	// Activity events
	| 'activity.launched' // Activity was launched (contains iframe URL + ids)
	| 'activity.closed' // Activity was closed
	| 'activity.rpc.outbound' // Host -> Activity message (async events)
	| 'activity.error' // Activity diagnostics
	| 'activity.ui.authorize_request' // Backend -> Stage UI: show consent UI for AUTHORIZE
	| 'activity.ui.purchase_request' // Backend -> Stage UI: show purchase confirmation

	// Activity proxy events
	| 'activity.proxy.status' // Proxy running, port, origin
	| 'activity.proxy.network' // Proxy network entry for DevTools

/**
 * Command types sent from stage clients to server
 */
export type StageCommandType =
	| 'send_message' // Send a message as a user
	| 'invoke_command' // Invoke slash command
	| 'invoke_context_command' // Invoke context menu command (right-click)
	| 'click_button' // Click a button
	| 'select_option' // Select from dropdown
	| 'submit_modal' // Submit modal form
	| 'add_reaction' // Add reaction to message
	| 'remove_reaction' // Remove reaction from message
	| 'start_typing' // Show typing indicator
	| 'request_state' // Request current state
	| 'subscribe_channel' // Subscribe to channel updates
	| 'set_current_user' // Set the current user for the session
	| 'switch_user' // Switch to a different user
	// Voice
	| 'join_voice' // Join a voice channel
	| 'leave_voice' // Leave voice channel
	| 'update_voice_state' // Update mute/deaf state
	// Simulation Support
	| 'control_response' // Response to server-initiated control command
	// Activity commands
	| 'launch_activity' // Launch an Activity for this session
	| 'close_activity' // Close the running Activity
	| 'activity_rpc' // Forward Activity RPC to/from backend host
	// Activity proxy commands
	| 'activity_set_url_mappings' // DevTools -> backend: update URL mappings
	| 'activity_set_csp_mode' // DevTools -> backend: change CSP mode
	// Activity auth commands
	| 'activity_authorize_result' // Stage UI -> backend: consent modal result for AUTHORIZE
	| 'activity_set_auth_settings' // DevTools -> backend: update auth simulator settings
	| 'activity_reset_auth' // DevTools -> backend: reset auth state to UNAUTHENTICATED
	| 'activity_set_platform_state' // DevTools -> backend: update layout/orientation/thermal
	| 'activity_set_iap_state' // DevTools -> backend: update SKUs/entitlements
	| 'activity_set_relationships' // DevTools -> backend: update relationships
	| 'activity_set_quests' // DevTools -> backend: update quests
	| 'activity_purchase_result' // Stage UI -> backend: purchase modal result
	| 'activity_set_origin_mode' // DevTools -> backend: set origin check mode
	| 'activity_set_sdk_shim' // DevTools -> backend: toggle SDK origin shim
	| 'activity_emit_event' // DevTools -> backend: emit an Activity event (e.g., ACTIVITY_JOIN)

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
	roles: StageRole[] // Guild roles
	messages: Record<string, StageMessage[]> // channelId -> messages
	users: StageUser[]
	commands: StageApplicationCommand[] // Available slash commands
	voice_states: StageVoiceState[] // Voice channel states
	currentUser?: StageUser

	/** Active Activity state (if any) */
	activity?: {
		instance_id: string
		frame_id: string
		application_id: string
		guild_id: string | null
		channel_id: string | null
		launch_url: string
		query_params: Record<string, string>
		ready_emitted: boolean
		auth_state: 'UNAUTHENTICATED' | 'AUTHENTICATED'
		auth_scopes?: string[]
		devtools_auth_mode?: 'auto_approve' | 'auto_deny' | 'manual'
		sdk_shim_enabled?: boolean
		proxy_origin?: string
		iframe_url?: string
	}

	/** Activity proxy status (if proxy server is running) */
	proxy?: {
		running: boolean
		port: number
		origin_template: string
	}
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
	/** Mock-only flag to indicate restricted/private channels */
	is_private?: boolean
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
 * Simplified role data for stage clients
 */
export interface StageRole {
	id: Snowflake
	name: string
	color: number // RGB integer (0 = no color)
	position: number
	guild_id: Snowflake
	hoist: boolean // Whether to show separately in member list
}

/**
 * Simplified voice state data for stage clients
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
	speaking?: boolean // Simulated speaking indicator
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
	flags?: number // Message flags (64 = EPHEMERAL)
	pinned?: boolean // Whether message is pinned
	type?: number // Message type (0=DEFAULT, 7=GUILD_MEMBER_JOIN, etc.)
	message_reference?: {
		// Reference for reply messages
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
	// Mock-only thread metadata for thread created messages
	thread_id?: Snowflake
	thread_name?: string
	thread_owner?: StageUser
	thread_message_count?: number
	thread_last_message_at?: string
}

// ============================================================================
// Application Command Types for Stage UI
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
	// Additional fields for "Bot is thinking..." indicator
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
 * Data payload for rest_call events
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
 * Data for invoke_context_command command
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
	emoji: string // Unicode emoji or custom emoji string
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
	emoji: string // Unicode emoji or custom emoji string
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
 * Data for join_voice command
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
 * Data for leave_voice command
 */
export interface StageLeaveVoiceData {
	guild_id: Snowflake
	user?: {
		id?: Snowflake
		username?: string
	}
}

/**
 * Data for update_voice_state command
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
// Simulation Event Payloads (Simulation Support)
// ============================================================================

/**
 * Step type for scenario step events
 */
export type ScenarioStepType = 'dispatch' | 'wait' | 'assert' | 'interact' | 'activity'

/**
 * Data payload for scenario.step.started events
 */
export interface StageScenarioStepStartedData {
	/** Run ID */
	runId: string
	/** Scenario ID */
	scenarioId: string
	/** Step index (zero-based) */
	stepIndex: number
	/** Step type being executed */
	stepType: ScenarioStepType
	/** Optional step ID from definition */
	stepId?: string
	/** Optional step description */
	description?: string
	/** Expected node ID for highlighting */
	expectedNodeId?: string
	/** Timestamp when step started */
	timestamp: number
}

/**
 * Data payload for scenario.step.completed events
 */
export interface StageScenarioStepCompletedData {
	/** Run ID */
	runId: string
	/** Scenario ID */
	scenarioId: string
	/** Step index (zero-based) */
	stepIndex: number
	/** Step type that completed */
	stepType: ScenarioStepType
	/** Optional step ID from definition */
	stepId?: string
	/** Execution status */
	status: 'ok' | 'skipped'
	/** Duration in milliseconds */
	duration: number
	/** IDs of actions recorded during this step */
	recordedActionIds: string[]
	/** Node ID that executed (from metadata or step config) */
	executedNodeId?: string
	/** Timestamp when step completed */
	timestamp: number
}

/**
 * Data payload for scenario.step.failed events
 */
export interface StageScenarioStepFailedData {
	/** Run ID */
	runId: string
	/** Scenario ID */
	scenarioId: string
	/** Step index (zero-based) */
	stepIndex: number
	/** Step type that failed */
	stepType: ScenarioStepType
	/** Optional step ID from definition */
	stepId?: string
	/** Failure status */
	status: 'failed' | 'timeout'
	/** Error message */
	error: string
	/** Additional error details */
	errorDetails?: unknown
	/** Duration before failure (ms) */
	duration: number
	/** For assertions: expected vs actual */
	assertionResult?: {
		expected?: unknown
		actual?: unknown
		failureReason?: string
	}
	/** Timestamp when failure occurred */
	timestamp: number
}

/**
 * Run status for scenario run events
 */
export type ScenarioRunEventStatus =
	| 'idle'
	| 'loaded'
	| 'running'
	| 'paused'
	| 'completed'
	| 'failed'
	| 'stopped'
	| 'error'

/**
 * Data payload for scenario.run.* events
 */
export interface StageScenarioRunEventData {
	/** Run ID */
	runId: string
	/** Scenario ID */
	scenarioId: string
	/** Current status */
	status: ScenarioRunEventStatus
	/** Current step index */
	currentStepIndex: number
	/** Total steps */
	totalSteps: number
	/** Success count */
	successCount: number
	/** Failure count */
	failureCount: number
	/** Skipped count */
	skippedCount: number
	/** Error message for 'failed' or 'error' status */
	error?: string
	/** Timestamp */
	timestamp: number
}

/**
 * Data payload for stage.playback.changed events
 */
export interface StagePlaybackChangedData {
	/** Current playback mode */
	mode: 'live' | 'playback'
	/** Whether currently playing */
	isPlaying: boolean
	/** Current time position in milliseconds */
	currentTime: number
	/** Total duration in milliseconds */
	duration: number
	/** Playback speed multiplier */
	speed: number
	/** Current event index */
	eventIndex: number
	/** Total events */
	totalEvents: number
	/** Current significant event index (for step-based navigation) */
	significantEventIndex?: number
	/** Total significant events */
	totalSignificantEvents?: number
	/** Timestamp */
	timestamp: number
}

/**
 * Data payload for stage.navigation.changed events
 */
export interface StageNavigationChangedData {
	/** Currently selected guild ID (null for DMs) */
	guildId: string | null
	/** Currently selected channel ID */
	channelId: string | null
	/** Channel type (for context) */
	channelType?: number
	/** Timestamp */
	timestamp: number

	// Scenario navigation fields
	/** Run ID when navigating scenario steps */
	runId?: string
	/** Scenario ID when navigating scenario steps */
	scenarioId?: string
	/** Navigation index (step being viewed, may differ from execution index) */
	navigationIndex?: number
	/** Step result summary for the navigated step */
	stepResult?: ScenarioStepResultSummary
	/** Last action ID at this step boundary (for action correlation) */
	actionIdsBoundary?: string
}

// ============================================================================
// Server-Initiated Control Commands (Simulation Support)
// ============================================================================

/**
 * Kinds of control commands the server can send.
 */
export type StageControlCommandKind =
	| 'playback_control' // Control playback (play/pause/seek/etc.)
	| 'navigation_control' // Control navigation (select guild/channel)
	| 'state_request' // Request current state

/**
 * Control command sent from server to Stage UI.
 * Stage UI should process and respond via 'control_response' command.
 */
export interface StageControlCommand {
	/** Unique command ID for response correlation */
	commandId: string
	/** Command kind */
	kind: StageControlCommandKind
	/** Command-specific payload */
	payload: StagePlaybackControlPayload | StageNavigationControlPayload | Record<string, never>
}

/**
 * Payload for playback_control commands.
 */
export interface StagePlaybackControlPayload {
	action:
		| 'play'
		| 'pause'
		| 'step_forward'
		| 'step_backward'
		| 'seek_to_event'
		| 'seek_to_time'
		| 'set_speed'
		| 'set_mode'
	/** For seek_to_event */
	eventIndex?: number
	/** For seek_to_time (ms) */
	time?: number
	/** For set_speed */
	speed?: number
	/** For set_mode */
	mode?: 'live' | 'playback'
}

/**
 * Payload for navigation_control commands.
 */
export interface StageNavigationControlPayload {
	action: 'select_guild' | 'select_channel' | 'open_dm' | 'open_thread'
	guildId?: string
	channelId?: string
	userId?: string
	threadId?: string
}

/**
 * Data for control_response command (Stage UI -> Server).
 */
export interface StageControlResponseData {
	/** Command ID being responded to */
	commandId: string
	/** Whether command succeeded */
	success: boolean
	/** Result data (command-specific) */
	result?: unknown
	/** Error message if failed */
	error?: string
}

/**
 * Result payload for `state_request` control commands.
 * Returned by Stage UI to allow the server (and external clients) to snapshot UI state.
 */
export interface StageStateRequestResult {
	playback: StagePlaybackChangedData
	navigation: StageNavigationChangedData
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

// ============================================================================
// User Management Command Payloads
// ============================================================================

/**
 * Data for set_current_user command
 */
export interface StageSetCurrentUserData {
	username?: string
	avatar?: string | null
	status?: 'online' | 'offline' | 'idle' | 'dnd'
	activities?: Array<{ name: string; type: number; state?: string; url?: string }>
}

/**
 * Data for switch_user command
 */
export interface StageSwitchUserData {
	user_id: string
}

// ============================================================================
// Activity Command Payloads
// ============================================================================

/**
 * Data for launch_activity command
 */
export interface StageLaunchActivityData {
	/** The URL to load in the Activity iframe */
	launch_url: string
	/** OAuth2 client ID / Application ID */
	application_id: string
	/** Guild context (optional) */
	guild_id?: string
	/** Channel context (optional) */
	channel_id?: string
	/** Locale override */
	locale?: string
	/** Platform override */
	platform?: string
	/** URL mappings for proxy */
	url_mappings?: Array<{ prefix: string; target: string }>
	/** CSP mode for proxy */
	csp_mode?: 'discord_strict' | 'relaxed'
	/** Launch path override */
	launch_path?: string
	/** Whether to inject the Embedded SDK compatibility shim into proxied HTML */
	sdk_shim_enabled?: boolean
}

/**
 * Data for activity_rpc command (Stage UI -> Server)
 * Forwards an RPC message from the Activity iframe to the backend host.
 */
export interface StageActivityRpcData {
	/** The raw RPC message from the Activity */
	message: unknown
	/** Routing hint: frame_id from the iframe */
	frame_id?: string
	/** Routing hint: instance_id */
	instance_id?: string
}

/**
 * Data for activity.launched event
 */
export interface StageActivityLaunchedData {
	/** Activity session record details */
	instance_id: string
	frame_id: string
	application_id: string
	guild_id: string | null
	channel_id: string | null
	user_id: string
	launch_url: string
	/** Query parameters to append to the iframe URL */
	query_params: Record<string, string>
	/** Proxy origin URL (if proxy is running) */
	proxy_origin?: string
	/** Full iframe URL through proxy (if proxy is running) */
	iframe_url?: string
	/** Whether the SDK shim is enabled for this proxy session */
	sdk_shim_enabled?: boolean
}

/**
 * Data for activity.closed event
 */
export interface StageActivityClosedData {
	instance_id: string
	reason?: string
}

/**
 * Data for activity.rpc.outbound event
 * Sent when the backend host has an async event to push to the Activity.
 */
export interface StageActivityRpcOutboundData {
	/** The outbound RPC message(s) to post to the Activity iframe */
	messages: unknown[]
}

/**
 * Data for activity.error event
 */
export interface StageActivityErrorData {
	instance_id?: string
	error: string
	details?: unknown
}

// ============================================================================
// Activity Auth Command/Event Payloads
// ============================================================================

/**
 * Data for activity.ui.authorize_request event (backend -> Stage UI)
 * Emitted when AUTHORIZE command needs user consent.
 */
export interface StageActivityAuthorizeRequestData {
	/** The RPC nonce to correlate the response */
	nonce: string
	/** The instance_id of the requesting Activity */
	instance_id: string
	/** OAuth2 client_id / application_id */
	client_id: string
	/** Requested OAuth2 scopes */
	scopes: string[]
	/** Opaque state string from Activity */
	state: string | null
	/** The response_type from the Activity (typically "code") */
	response_type: string
	/** Optional prompt hint from Activity ("none" or "consent") */
	prompt: string | null
}

/**
 * Data for activity_authorize_result command (Stage UI -> backend)
 * Sent when user approves or denies the consent modal.
 */
export interface StageActivityAuthorizeResultData {
	/** The RPC nonce being resolved */
	nonce: string
	/** Whether the user approved the authorization */
	approved: boolean
	/** Scopes the user approved (may be subset of requested) */
	approved_scopes?: string[]
}

/**
 * Data for activity_set_auth_settings command
 */
export interface StageActivitySetAuthSettingsData {
	mode: 'auto_approve' | 'auto_deny' | 'manual'
	default_scopes?: string[]
}

/**
 * Data for activity_reset_auth command
 */
export interface StageActivityResetAuthData {
	/** (empty - no data needed, session is implicit) */
}

/**
 * Payload for activity_set_platform_state command.
 * DevTools sends this to update layout mode, orientation, or thermal state.
 * Only changed fields need to be present.
 */
export interface StageActivitySetPlatformStateData {
	layout_mode?: number
	screen_orientation?: number
	orientation?: 'portrait' | 'landscape'
	thermal_state?: number
}

// ============================================================================
// Activity IAP/Social/Quest Command/Event Payloads
// ============================================================================

/**
 * Data for activity_set_iap_state command (DevTools -> backend)
 */
export interface StageActivitySetIapStateData {
	skus: Array<{
		id: string
		name: string
		type: number
		application_id: string
		slug: string
		price: { amount: number; currency: string }
		flags: number
	}>
	entitlements: Array<{
		id: string
		sku_id: string
		user_id: string
		application_id: string
		type: number
		consumed: boolean
		starts_at?: string
		ends_at?: string
		guild_id?: string
	}>
}

/**
 * Data for activity_set_relationships command (DevTools -> backend)
 */
export interface StageActivitySetRelationshipsData {
	relationships: Array<{
		id: string
		type: number
		user: {
			id: string
			username: string
			discriminator: string
			avatar: string | null
			global_name?: string | null
		}
		presence?: {
			status: string
			activities?: Array<{ name: string; type: number }>
		}
	}>
}

/**
 * Data for activity_set_quests command (DevTools -> backend)
 */
export interface StageActivitySetQuestsData {
	quests: Array<{
		id: string
		name: string
		description: string
		reward_code_sku_id?: string
		enrollment_status: {
			quest_id: string
			enrolled_at: string
			completed_at: string | null
			progress: number
			timer_started_at: string | null
			timer_duration_seconds: number
		} | null
	}>
}

/**
 * Data for activity_purchase_result command (Stage UI -> backend)
 */
export interface StageActivityPurchaseResultData {
	nonce: string
	approved: boolean
}

/**
 * Data for activity.ui.purchase_request event (backend -> Stage UI)
 */
export interface StageActivityPurchaseRequestData {
	nonce: string
	instance_id: string
	sku_id: string
	sku_name: string
	sku_price: { amount: number; currency: string }
}

// ============================================================================
// Activity Proxy Command/Event Payloads
// ============================================================================

/**
 * Data for activity_set_url_mappings command
 */
export interface StageActivitySetUrlMappingsData {
	url_mappings: Array<{ prefix: string; target: string }>
}

/**
 * Data for activity_set_csp_mode command
 */
export interface StageActivitySetCspModeData {
	csp_mode: 'discord_strict' | 'relaxed'
}

/**
 * Data for activity.proxy.status event
 */
export interface StageActivityProxyStatusData {
	running: boolean
	port: number
	origin_template: string
}

/**
 * Data for activity_set_origin_mode command
 */
export interface StageActivitySetOriginModeData {
	mode: 'strict' | 'lenient'
}

/**
 * Data for activity_set_sdk_shim command
 */
export interface StageActivitySetSdkShimData {
	enabled: boolean
}

/**
 * Data for activity_emit_event command (DevTools -> backend)
 */
export interface StageActivityEmitEventData {
	event_name: string
	data?: unknown
}
