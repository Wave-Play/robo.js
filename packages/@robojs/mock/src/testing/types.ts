/**
 * Testing Module Types
 *
 * Types for the @robojs/mock/testing module.
 */
import type { Snowflake } from 'discord-api-types/v10'

// Re-export registry types
export type { AssertionResult, TestResult, TestFileEntry, TestSessionRegistry } from '../session/registry.js'

/**
 * Test session wrapper with convenience methods
 */
export interface TestSession {
	/** Session ID */
	id: string
	/** Bot token for this session */
	token: string
	/** Session name */
	name?: string
	/** Bot user info */
	botUser: {
		id: Snowflake
		username: string
	}
	/** Pre-configured guilds */
	guilds: Array<{
		id: Snowflake
		name: string
	}>
	/** Pre-configured channels */
	channels: Array<{
		id: Snowflake
		name: string
		guildId?: Snowflake
		type: number
	}>
	/** Convenience: first guild ID */
	guildId: Snowflake
	/** Test file path this session is associated with */
	testFilePath?: string

	/**
	 * Destroy the session and clean up
	 */
	destroy(): Promise<void>
}

/**
 * Configuration for creating a test session
 */
export interface CreateTestSessionConfig {
	/** Optional session name */
	name?: string
	/** Session TTL in milliseconds */
	ttl?: number
	/** Session configuration */
	config?: {
		/** Bot user configuration */
		botUser?: {
			username?: string
			id?: string
		}
		/** Pre-configured guilds */
		guilds?: Array<{
			id?: string
			name?: string
			channels?: Array<{
				name?: string
				type?: number
			}>
		}>
		/** Pre-configured users */
		users?: Array<{
			id?: string
			username?: string
			bot?: boolean
		}>
		/** Application ID for the bot */
		applicationId?: string
		/** Commands to seed in session (for Stage UI testing) */
		commands?: Array<{
			name: string
			description: string
			type?: number
			options?: unknown[]
		}>
		/** Maximum number of recorded actions before LRU eviction (default: 10000) */
		maxActions?: number
		/** Maximum number of recorded logs before LRU eviction (default: 10000) */
		maxLogs?: number
		/** Enforce intents */
		enforceIntents?: boolean
		/** Approved privileged intents as bigint */
		approvedPrivilegedIntents?: bigint
		/** Permission enforcement level */
		permissionEnforcement?: 'none' | 'basic' | 'strict'
	}
}

/**
 * Options for expectAction helper
 */
export interface ExpectActionOptions {
	/** Human-readable description of what's being asserted */
	description: string
	/** Action type to wait for */
	type: string
	/** Expected data to match */
	expected: unknown
	/** Timeout in milliseconds (default: 5000) */
	timeout?: number
}

/**
 * Options for waiting for an action
 */
export interface WaitForActionOptions {
	/** Action type to wait for */
	type: string
	/** Timeout in milliseconds (default: 5000) */
	timeout?: number
	/** Filter function to match specific actions */
	filter?: (action: RecordedAction) => boolean
}

/**
 * Message returned from `getChannelMessages`.
 * Represents the REST API shape of a message as returned by the control API.
 */
export interface MockMessage {
	/** Message ID */
	id: string
	/** Message content */
	content: string
	/** Message author */
	author: {
		id: string
		username?: string
		bot?: boolean
	}
	/** Additional fields may be present depending on message type */
	[key: string]: unknown
}

/**
 * Recorded action from the mock server
 */
export interface RecordedAction {
	/** Action ID */
	id: string
	/** Action type (e.g., message_sent, interaction_response) */
	type: string
	/** Action data */
	data: unknown
	/** Timestamp when action was recorded */
	timestamp: number
	/** Optional sequence number */
	sequence?: number
}

/**
 * Session state snapshot
 */
export interface SessionState {
	botUser: {
		id: string
		username: string
		discriminator: string
		bot: boolean
	}
	guilds: Array<{
		id: string
		name: string
		ownerId: string
		channels: string[]
		members: string[]
		roles: string[]
	}>
	channels: Array<{
		id: string
		guildId?: string
		name: string
		type: number
	}>
}

/**
 * Response from creating a session via Control API
 */
export interface SessionResponse {
	session_id: string
	token: string
	expires_at: number
	state: SessionState
}

/**
 * Discord event data for dispatch
 */
export interface DispatchEventData {
	/** Event name (e.g., MESSAGE_CREATE) */
	t: string
	/** Event data */
	d: Record<string, unknown>
}

/**
 * Interaction dispatch data
 */
export interface InteractionData {
	/** Interaction type (2 = APPLICATION_COMMAND, 3 = MESSAGE_COMPONENT, 4 = AUTOCOMPLETE, 5 = MODAL_SUBMIT) */
	type: number
	/** Interaction data */
	data: {
		/** Command name for APPLICATION_COMMAND */
		name?: string
		/** Command type (1 = CHAT_INPUT, 2 = USER, 3 = MESSAGE) */
		type?: number
		/** Command options */
		options?: Array<{
			name: string
			type: number
			value?: unknown
			/** Whether this option is the currently focused autocomplete option */
			focused?: boolean
			options?: Array<{ name: string; type: number; value?: unknown; focused?: boolean }>
		}>
		/** Component custom_id for MESSAGE_COMPONENT */
		custom_id?: string
		/** Component type for MESSAGE_COMPONENT */
		component_type?: number
		/** Values for SELECT_MENU */
		values?: string[]
		/** Components for MODAL_SUBMIT */
		components?: Array<{
			type: number
			components: Array<{
				type: number
				custom_id: string
				value: string
			}>
		}>
		/** Target ID for context menu commands (USER or MESSAGE) */
		target_id?: string
		/** Resolved data (users, members, channels, roles, messages) */
		resolved?: Record<string, unknown>
	}
	/** Guild ID (optional, for guild interactions) */
	guild_id?: string
	/** Channel ID (optional) */
	channel_id?: string
	/**
	 * User who triggered the interaction (optional, defaults to current test user).
	 */
	user?: {
		id?: string
		username?: string
	}
	/** Guild member who triggered the interaction (optional, for permission-aware dispatches) */
	member?: {
		user?: { id?: string; username?: string }
		roles?: string[]
		permissions?: string
	}
	/** Message associated with the interaction (for MESSAGE_COMPONENT interactions) */
	message?: {
		id: string
		[key: string]: unknown
	}
}

/**
 * Mock server configuration
 */
export interface MockConfig {
	/** Base URL for the mock server */
	baseUrl: string
	/** Control API URL */
	controlUrl: string
	/** REST API URL */
	restUrl: string
	/** Gateway WebSocket URL */
	gatewayUrl: string
	/** Default timeout for operations in ms */
	defaultTimeout: number
}

/**
 * Default mock server configuration
 * Note: These are fallback values. The actual URLs are built dynamically
 * in getMockConfig() using ROBO_MOCK_PORT env var or server-info file.
 */
export const DEFAULT_MOCK_CONFIG: MockConfig = {
	baseUrl: 'http://localhost:3000',
	controlUrl: 'http://localhost:3000/api/control',
	restUrl: 'http://localhost:3000/api',
	gatewayUrl: 'ws://localhost:3000',
	defaultTimeout: 5000
}
