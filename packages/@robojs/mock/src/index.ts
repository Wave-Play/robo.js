/**
 * @robojs/mock - Discord Gateway mock server for automated testing
 *
 * @example
 * ```typescript
 * import { sessionManager, Session, SessionManager } from '@robojs/mock'
 *
 * // Create a session for testing
 * const session = await sessionManager.create({ name: 'my-test' })
 * console.log(`Use token: ${session.token}`)
 *
 * // Check session state
 * const state = session.state
 *
 * // Clean up
 * await sessionManager.delete(session.id)
 * ```
 */

// Core exports
export { Session, SessionManager, InMemoryStorage, MockServerState, ActionRecorder, RecordingPlayer } from './session/index.js'
export type { StateOptions } from './session/index.js'
export { sessionManager } from './core/manager.js'
export { mockLogger } from './core/logger.js'
export { GatewayServer, getGatewayServer, closeGatewayServer } from './core/gateway.js'

// Discord Gateway constants
export {
	GatewayOpcodes,
	GatewayCloseCodes,
	DEFAULT_HEARTBEAT_INTERVAL,
	GATEWAY_VERSION
} from './discord/opcodes.js'

// Utility exports (public-facing only)
export {
	generateSnowflake,
	snowflakeToTimestamp,
	timestampToSnowflake
} from './utils/snowflake.js'
export {
	getMockServerUrl,
	getMockRestApiUrl,
	getStageUIUrl
} from './utils/server.js'

// State factory functions
export {
	createSessionState,
	createDefaultGuildWithChannel,
	createMockUser,
	createMockGuild,
	createMockChannel,
	createMockMessage,
	// Thread helpers
	createMockThread,
	// Forum helpers
	createMockForumChannel,
	// Role & Member helpers
	createMockRole,
	createMockGuildMember
} from './session/state.js'

// Auth exports
export { createAuthMiddleware, NoOpAuthProvider, ApiKeyAuthProvider } from './auth/index.js'

// Storage exports
export {
	MemoryAttachmentStorage,
	createStorage,
	type AttachmentStorage,
	type StorageConfig,
	type StorageStats
} from './storage/attachment-storage.js'

// Permission utilities (public-facing only)
export {
	computePermissions,
	hasPermission,
	hasAnyPermission,
	hasAllPermissions,
	getPermissionNames,
	DiscordErrorCodes,
	PermissionFlagsBits
} from './core/permissions.js'

// Constants
export { AttachmentFlags, AttachmentLimits } from './types/index.js'
export { ForumSortOrderType, ForumLayoutType } from './types/index.js'
export { WebhookType, WebhookLimits } from './types/index.js'
export { RoleLimits, OverwriteType } from './types/index.js'

// Plugin config exports
export { DEFAULT_MOCK_PLUGIN_CONFIG } from './types/plugin.js'
export type { MockPluginConfig } from './types/plugin.js'

// Mock mode helpers
export { getMockModeState } from './robo/init.js'
export type { MockModeState } from './robo/init.js'
export { getMockModeSession } from './robo/start.js'

// Type exports (safe — erased at runtime, no backward-compat risk)
export type {
	GatewayPayload,
	HelloPayloadData,
	IdentifyPayloadData,
	InteractionCreatePayloadOptions,
	ButtonInteractionPayloadOptions,
	SelectMenuInteractionPayloadOptions,
	ModalSubmitInteractionPayloadOptions,
	AutocompleteInteractionPayloadOptions,
	ContextMenuInteractionPayloadOptions,
	ThreadCreatePayloadOptions,
	ThreadUpdatePayloadOptions,
	ThreadDeletePayloadOptions,
	ThreadListSyncPayloadOptions,
	ThreadMemberUpdatePayloadOptions,
	ThreadMembersUpdatePayloadOptions,
	WebhooksUpdatePayloadOptions,
	GuildRoleCreatePayloadOptions,
	GuildRoleUpdatePayloadOptions,
	GuildRoleDeletePayloadOptions,
	GuildMemberAddPayloadOptions,
	GuildMemberUpdatePayloadOptions,
	GuildMemberRemovePayloadOptions
} from './discord/payloads.js'

export type {
	Session as ISession,
	SessionState,
	ConnectionState,
	CreateSessionOptions,
	SessionConfig,
	SessionManagerOptions,
	SessionStorage,
	MockGuild,
	MockGuildConfig,
	MockChannel,
	MockChannelConfig,
	SeedMessageConfig,
	MockUser,
	MockUserConfig,
	MockMessage,
	MockMessageConfig,
	MockInteraction,
	MockInteractionOption,
	DispatchSlashCommandOptions,
	DispatchButtonClickOptions,
	DispatchSelectMenuOptions,
	DispatchModalSubmitOptions,
	DispatchAutocompleteOptions,
	DispatchContextMenuOptions,
	AuthProvider,
	AuthResult,
	ActionType,
	RecordedAction,
	RecordActionOptions,
	SerializedSessionState,
	SerializedMockGuild,
	SerializedMockChannel,
	SerializedMockUser,
	SerializedMockMessage,
	SerializedMockInteraction,
	SessionRecording,
	RecordingMetadata,
	ValidationMode,
	ReplayOptions,
	ReplayState,
	ReplayResult,
	ValidationResult,
	ValidationMismatch,
	MockThread,
	MockThreadConfig,
	MockThreadMetadata,
	MockThreadMember,
	DispatchThreadCreateOptions,
	SerializedMockThread,
	MockAttachment,
	StoredAttachment,
	AttachmentPayload,
	MockForumChannel,
	MockForumChannelConfig,
	MockForumTag,
	MockForumThread,
	MockForumPostConfig,
	MockDefaultReaction,
	SerializedMockForumChannel,
	SerializedMockForumTag,
	SerializedMockForumThread,
	MockWebhook,
	MockWebhookConfig,
	SerializedMockWebhook,
	MockRole,
	MockRoleConfig,
	MockRoleTags,
	MockGuildMember,
	MockGuildMemberConfig,
	MockChannelOverwrite,
	SerializedMockRole,
	SerializedMockGuildMember,
	DispatchRoleCreateOptions,
	DispatchRoleUpdateOptions,
	DispatchRoleDeleteOptions,
	DispatchGuildMemberAddOptions,
	DispatchGuildMemberUpdateOptions,
	DispatchGuildMemberRemoveOptions
} from './types/index.js'

export type {
	PermissionCheckResult,
	PermissionContext,
	PermissionEnforcementLevel,
	EnforcementOptions,
	EnforcementContext
} from './core/permissions.js'

export type { SessionSummary } from './core/summary.js'
export type { PersistedSession } from './core/persistence.js'
export type { EnforcePermissionsOptions } from './utils/permission-check.js'

// Stage types (kept as types — no runtime cost)
export type {
	StageEventType,
	StageCommandType,
	StageEvent,
	StageCommand,
	StageConnectionState,
	StateSyncPayload,
	StageGuild,
	StageChannel,
	StageUser,
	StageMember,
	StageMessage,
	StageMessageSource,
	StageMessageCreateData,
	StageInteractionResponseData,
	StageBotReadyData,
	StageBotDisconnectedData,
	StageBotErrorData,
	StageCommandResponseData,
	StageRESTCallData,
	StageSendMessageData,
	StageInvokeCommandData,
	StageClickButtonData,
	StageSelectOptionData,
	StageSubmitModalData,
	StageAddReactionData,
	StageStartTypingData,
	StageSubscribeChannelData,
	BufferedStageEvent,
	StageServerConfig
} from './types/stage.js'
