import { randomBytes } from 'crypto'
import { ChannelType, type Snowflake } from 'discord-api-types/v10'
import type {
	SessionState,
	MockGuild,
	MockChannel,
	MockUser,
	MockMessage,
	MockInteraction,
	MockUserConfig,
	MockMessageConfig,
	MockThread,
	MockThreadConfig,
	MockThreadMember,
	MockAttachment,
	StoredAttachment,
	SerializedSessionState,
	SerializedMockGuild,
	SerializedMockChannel,
	SerializedMockUser,
	SerializedMockMessage,
	SerializedMockInteraction,
	SerializedMockThread,
	SerializedMockAttachment,
	SerializedStoredAttachment,
	ComponentsV2ValidationResult,
	MockPoll,
	MockPollConfig,
	MockPollAnswer,
	MockPollResults,
	// Phase 4H: Forum & Media Channels
	MockForumChannel,
	MockForumChannelConfig,
	MockForumTag,
	MockForumThread,
	MockForumPostConfig,
	// Phase 4I: Stickers
	MockSticker,
	MockStickerConfig,
	// Phase 4J: Webhooks
	MockWebhook,
	MockWebhookConfig,
	SerializedMockWebhook,
	// Phase 4K: Emojis
	MockEmoji,
	MockEmojiConfig,
	// Phase 4L: Roles & Permissions
	MockRole,
	MockRoleConfig,
	MockGuildMember,
	MockGuildMemberConfig,
	MockChannelOverwrite,
	SerializedMockRole,
	SerializedMockGuildMember,
	// Phase 4L-B: Bans
	MockBan,
	MockBanConfig,
	// Phase 4M: Application Commands
	MockApplicationCommand,
	MockApplicationCommandConfig,
	// Phase 5A: Invites
	MockInvite,
	MockInviteConfig,
	// Phase 5B: Scheduled Events
	MockScheduledEvent,
	MockScheduledEventConfig,
	MockScheduledEventUpdateConfig,
	// Phase 5C: Auto-Moderation
	MockAutoModRule,
	MockAutoModRuleConfig,
	MockAutoModRuleUpdateConfig,
	// Phase 7: Voice States
	MockVoiceState,
	// Phase 5I: Reactions
	MockReaction,
	// Phase 11: Stage Instances
	MockStageInstance,
	MockStageInstanceConfig,
	// Phase 11: Command Permissions
	MockCommandPermission,
	// Phase 14: Audit Logs
	MockAuditLogEntry,
	MockAuditLogEntryConfig
} from '../types/index.js'
import { AuditLogEvent, AuditLogLimits } from '../types/index.js'
import { ComponentLimits, ComponentsV2Limits, ComponentTypeV2, PollLayoutType, ForumLayoutType, ForumSortOrderType, StickerType, StickerFormatType, StickerLimits, WebhookType, WebhookLimits, EmojiLimits, RoleLimits, BanLimits, ApplicationCommandType, CommandLimits, InviteLimits, ScheduledEventLimits, GuildScheduledEventStatus, GuildScheduledEventEntityType, AutoModLimits, StageInstancePrivacyLevel } from '../types/index.js'
import { generateSnowflake } from '../utils/snowflake.js'
import { MentionParser } from '../utils/mention-parser.js'
import { MemoryAttachmentStorage, type StorageConfig } from '../storage/attachment-storage.js'

// Default limits for memory management
const DEFAULT_MAX_MESSAGES = 1000
const DEFAULT_MAX_INTERACTIONS = 1000

/**
 * Options for creating a MockServerState
 */
export interface StateOptions {
	botUser?: MockUserConfig
	applicationId?: Snowflake
	maxMessages?: number
	/** Storage backend configuration for attachments */
	storage?: StorageConfig
}

/**
 * Centralized state management for a mock session.
 * Provides CRUD methods for all mock entities.
 */
export class MockServerState implements SessionState {
	readonly guilds: Map<Snowflake, MockGuild>
	readonly channels: Map<Snowflake, MockChannel>
	readonly dmChannels: Map<Snowflake, MockChannel>
	readonly users: Map<Snowflake, MockUser>
	readonly messages: Map<Snowflake, MockMessage>
	readonly interactions: Map<Snowflake, MockInteraction>
	readonly threadMembers: Map<Snowflake, Map<Snowflake, MockThreadMember>> // threadId -> userId -> member
	readonly pollVotes: Map<Snowflake, Map<Snowflake, number[]>> // Phase 4G: messageId -> userId -> answerIds[]
	readonly stickers: Map<Snowflake, MockSticker> // Phase 4I: stickerId -> sticker
	readonly webhooks: Map<Snowflake, MockWebhook> // Phase 4J: webhookId -> webhook
	readonly emojis: Map<Snowflake, MockEmoji> // Phase 4K: emojiId -> emoji
	readonly applicationEmojis: Map<Snowflake, MockEmoji> // Phase 20: Application-level emojis
	readonly roles: Map<Snowflake, MockRole> // Phase 4L: roleId -> role
	readonly guildMembers: Map<string, MockGuildMember> // Phase 4L: `${guildId}:${userId}` -> member
	readonly bans: Map<string, MockBan> // Phase 4L-B: `${guildId}:${userId}` -> ban
	readonly commands: Map<Snowflake, MockApplicationCommand> // Phase 4M: commandId -> command
	readonly invites: Map<string, MockInvite> // Phase 5A: code -> invite
	readonly scheduledEvents: Map<string, MockScheduledEvent> // Phase 5B: `${guildId}:${eventId}` -> event
	readonly autoModRules: Map<string, MockAutoModRule> // Phase 5C: `${guildId}:${ruleId}` -> rule
	readonly stageInstances: Map<Snowflake, MockStageInstance> // Phase 11: channelId -> stage instance
	readonly commandPermissions: Map<string, MockCommandPermission[]> // Phase 11: `${guildId}:${commandId}` -> permissions
	readonly voiceStates: Map<string, MockVoiceState> // Phase 7: `${guildId}:${userId}` -> voice state
	readonly auditLogs: Map<string, MockAuditLogEntry[]> // Phase 14: guildId -> audit log entries
	readonly botUser: MockUser
	readonly applicationId: Snowflake

	/**
	 * Attachment storage backend.
	 * @see AttachmentStorage for the interface
	 * @see MemoryAttachmentStorage for the default implementation
	 */
	readonly attachmentStorage: MemoryAttachmentStorage

	/**
	 * @deprecated Use attachmentStorage methods instead. This getter provides backward compatibility.
	 */
	get attachments(): Map<Snowflake, StoredAttachment> {
		// Return a proxy Map that delegates to the storage backend
		// This maintains backward compatibility with code that accesses attachments directly
		return (this.attachmentStorage as unknown as { attachments: Map<Snowflake, StoredAttachment> }).attachments
	}

	private _sequence: number = 0
	private readonly maxMessages: number
	private readonly maxInteractions: number
	private readonly interactionsByToken: Map<string, Snowflake>
	private readonly webhooksByToken: Map<string, Snowflake> // Phase 4J: token -> webhookId

	/**
	 * Current "acting" user for Stage UI interactions.
	 * Separate from botUser - represents the human using Stage.
	 */
	private _currentUser: MockUser | null = null

	constructor(options?: StateOptions) {
		this.guilds = new Map()
		this.channels = new Map()
		this.dmChannels = new Map()
		this.users = new Map()
		this.messages = new Map()
		this.interactions = new Map()
		this.threadMembers = new Map()
		this.pollVotes = new Map()
		this.stickers = new Map()
		this.webhooks = new Map()
		this.emojis = new Map()
		this.applicationEmojis = new Map()
		this.roles = new Map()
		this.guildMembers = new Map()
		this.bans = new Map()
		this.commands = new Map()
		this.invites = new Map()
		this.scheduledEvents = new Map()
		this.autoModRules = new Map()
		this.stageInstances = new Map()
		this.commandPermissions = new Map()
		this.voiceStates = new Map()
		this.auditLogs = new Map()
		this.interactionsByToken = new Map()
		this.webhooksByToken = new Map()
		this.maxMessages = options?.maxMessages ?? DEFAULT_MAX_MESSAGES
		this.maxInteractions = DEFAULT_MAX_INTERACTIONS

		// Initialize attachment storage backend
		// Currently only memory storage is supported synchronously
		// Future async backends would require architectural changes
		this.attachmentStorage = new MemoryAttachmentStorage()

		// Create bot user
		this.botUser = createMockUser({
			bot: true,
			username: 'MockBot',
			...options?.botUser
		})

		// Add bot user to users map
		this.users.set(this.botUser.id, this.botUser)

		// Set application ID (defaults to bot user ID)
		this.applicationId = options?.applicationId ?? this.botUser.id
	}

	// ============================================================================
	// Sequence Management
	// ============================================================================

	get sequence(): number {
		return this._sequence
	}

	set sequence(value: number) {
		this._sequence = value
	}

	/**
	 * Get and increment the sequence number
	 */
	nextSequence(): number {
		return ++this._sequence
	}

	// ============================================================================
	// Current User Management
	// ============================================================================

	/**
	 * Get the current acting user for Stage UI interactions.
	 * Creates a default user on first access if none is set.
	 */
	get currentUser(): MockUser {
		if (!this._currentUser) {
			this._currentUser = createMockUser({
				id: generateSnowflake(),
				username: 'You',
				bot: false
			})
			this.users.set(this._currentUser.id, this._currentUser)
		}
		return this._currentUser
	}

	/**
	 * Set the current acting user.
	 */
	set currentUser(user: MockUser) {
		this._currentUser = user
		this.users.set(user.id, user)
	}

	/**
	 * Update the current user's properties without changing their ID.
	 */
	updateCurrentUser(updates: Partial<Omit<MockUser, 'id'>>): MockUser {
		const current = this.currentUser
		const updated: MockUser = { ...current, ...updates }
		this.users.set(current.id, updated)
		this._currentUser = updated
		return updated
	}

	/**
	 * Switch to a different user as the current user.
	 * Returns the user if found, undefined otherwise.
	 */
	switchCurrentUser(userId: Snowflake): MockUser | undefined {
		const user = this.users.get(userId)
		if (user) {
			this._currentUser = user
			return user
		}
		return undefined
	}

	// ============================================================================
	// Guild Operations
	// ============================================================================

	/**
	 * Get a guild by ID
	 */
	getGuild(id: Snowflake): MockGuild | undefined {
		return this.guilds.get(id)
	}

	/**
	 * Add a guild to the state
	 */
	addGuild(guild: MockGuild): void {
		this.guilds.set(guild.id, guild)

		// Create @everyone role if not already exists
		// The @everyone role has the same ID as the guild
		if (!this.roles.has(guild.id)) {
			this.roles.set(guild.id, {
				id: guild.id,
				guildId: guild.id,
				name: '@everyone',
				color: 0,
				hoist: false,
				position: 0,
				permissions: MockServerState.DEFAULT_EVERYONE_PERMISSIONS,
				managed: false,
				mentionable: false,
				flags: 0
			})
		}

		// Ensure @everyone role is in guild's roles array
		if (!guild.roles.includes(guild.id)) {
			guild.roles.push(guild.id)
		}

		// Add bot user as member if not already
		if (!guild.members.includes(this.botUser.id)) {
			guild.members.push(this.botUser.id)
		}

		// Create a proper guild member entry for the bot user
		// This ensures the bot can use @me endpoints like setNickname
		const botMemberKey = `${guild.id}:${this.botUser.id}`
		if (!this.guildMembers.has(botMemberKey)) {
			this.guildMembers.set(botMemberKey, {
				userId: this.botUser.id,
				guildId: guild.id,
				roles: [],
				nick: null,
				joinedAt: new Date().toISOString(),
				premiumSince: null,
				deaf: false,
				mute: false,
				pending: false,
				communicationDisabledUntil: null,
				flags: 0
			})
		}
	}

	/**
	 * Add a user as a member to a guild.
	 * Creates the guild member entry if it doesn't exist.
	 */
	addMemberToGuild(guildId: Snowflake, userId: Snowflake, config?: Partial<MockGuildMemberConfig>): void {
		const guild = this.guilds.get(guildId)
		if (!guild) return

		// Add to guild.members array if not already present
		if (!guild.members.includes(userId)) {
			guild.members.push(userId)
		}

		// Create guild member entry
		const memberKey = `${guildId}:${userId}`
		if (!this.guildMembers.has(memberKey)) {
			this.guildMembers.set(memberKey, {
				userId,
				guildId,
				roles: config?.roles ?? [],
				nick: config?.nick ?? null,
				joinedAt: new Date().toISOString(),
				premiumSince: null,
				deaf: false,
				mute: false,
				pending: false,
				communicationDisabledUntil: null,
				flags: 0
			})
		}
	}

	/**
	 * Remove a guild from the state
	 */
	removeGuild(id: Snowflake): boolean {
		const guild = this.guilds.get(id)
		if (!guild) {
			return false
		}

		// Remove all channels for this guild
		for (const channelId of guild.channels) {
			this.channels.delete(channelId)
		}

		// Remove messages from this guild's channels
		for (const [messageId, message] of this.messages) {
			if (message.guildId === id) {
				this.messages.delete(messageId)
			}
		}

		return this.guilds.delete(id)
	}

	// ============================================================================
	// Channel Operations
	// ============================================================================

	/**
	 * Get a channel by ID (includes guild channels and DM channels)
	 */
	getChannel(id: Snowflake): MockChannel | undefined {
		return this.channels.get(id) ?? Array.from(this.dmChannels.values()).find((c) => c.id === id)
	}

	/**
	 * Get all channels for a guild
	 */
	getChannelsForGuild(guildId: Snowflake): MockChannel[] {
		return Array.from(this.channels.values()).filter((c) => c.guildId === guildId)
	}

	/**
	 * Add a channel to the state
	 */
	addChannel(channel: MockChannel): void {
		this.channels.set(channel.id, channel)
	}

	/**
	 * Add a channel to a guild
	 */
	addChannelToGuild(guildId: Snowflake, channel: MockChannel): void {
		// Set guild ID on channel
		channel.guildId = guildId

		// Add channel to state
		this.channels.set(channel.id, channel)

		// Add channel ID to guild's channel list
		const guild = this.guilds.get(guildId)
		if (guild && !guild.channels.includes(channel.id)) {
			guild.channels.push(channel.id)
		}
	}

	/**
	 * Remove a channel from the state
	 */
	removeChannel(id: Snowflake): boolean {
		const channel = this.channels.get(id)
		if (channel) {
			// Remove from guild's channel list if applicable
			if (channel.guildId) {
				const guild = this.guilds.get(channel.guildId)
				if (guild) {
					const idx = guild.channels.indexOf(id)
					if (idx !== -1) {
						guild.channels.splice(idx, 1)
					}
				}
			}

			// Remove messages in this channel
			for (const [messageId, message] of this.messages) {
				if (message.channelId === id) {
					this.messages.delete(messageId)
				}
			}

			return this.channels.delete(id)
		}
		return false
	}

	// ============================================================================
	// User Operations
	// ============================================================================

	/**
	 * Get a user by ID
	 */
	getUser(id: Snowflake): MockUser | undefined {
		return this.users.get(id)
	}

	/**
	 * Add a user to the state
	 */
	addUser(user: MockUser): void {
		this.users.set(user.id, user)
	}

	/**
	 * Remove a user from the state (cannot remove bot user)
	 */
	removeUser(id: Snowflake): boolean {
		if (id === this.botUser.id) {
			return false // Cannot remove bot user
		}
		return this.users.delete(id)
	}

	/**
	 * Get or create a default test user for dispatching messages
	 * This creates a consistent "TestUser" that can be used when no author is specified
	 */
	getOrCreateTestUser(userId?: Snowflake): MockUser {
		// Use provided ID or a fixed default ID for the test user
		const testUserId = userId ?? '123456789012345678'

		let user = this.users.get(testUserId)
		if (!user) {
			user = createMockUser({
				id: testUserId,
				username: 'TestUser',
				bot: false
			})
			this.users.set(testUserId, user)
		}
		return user
	}

	// ============================================================================
	// Message Operations
	// ============================================================================

	/**
	 * Get a message by ID
	 */
	getMessage(id: Snowflake): MockMessage | undefined {
		return this.messages.get(id)
	}

	/**
	 * Get messages for a channel, optionally limited
	 */
	getMessagesForChannel(channelId: Snowflake, limit?: number): MockMessage[] {
		const channelMessages = Array.from(this.messages.values())
			.filter((m) => m.channelId === channelId)
			.sort((a, b) => {
				// Sort by timestamp descending (newest first)
				return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
			})

		return limit ? channelMessages.slice(0, limit) : channelMessages
	}

	/**
	 * Create and store a message
	 */
	createMessage(config: MockMessageConfig): MockMessage {
		// Enforce message limit (LRU-style)
		if (this.messages.size >= this.maxMessages) {
			// Remove oldest message
			const oldest = this.messages.keys().next().value
			if (oldest) {
				this.messages.delete(oldest)
			}
		}

		const message = createMockMessage(config)

		// Phase 4I: Resolve sticker_ids to sticker_items
		if (config.sticker_ids?.length) {
			message.sticker_items = config.sticker_ids
				.map((id) => this.stickers.get(id))
				.filter((s): s is MockSticker => s !== undefined)
				.map((s) => ({
					id: s.id,
					name: s.name,
					format_type: s.format_type
				}))
		}

		this.messages.set(message.id, message)
		return message
	}

	/**
	 * Update a message
	 */
	updateMessage(id: Snowflake, updates: Partial<MockMessage>): MockMessage | undefined {
		const message = this.messages.get(id)
		if (!message) {
			return undefined
		}

		// Apply updates (except id, channelId, authorId which are immutable)
		const updatedMessage: MockMessage = {
			...message,
			...updates,
			id: message.id,
			channelId: message.channelId,
			authorId: message.authorId,
			editedTimestamp: new Date().toISOString()
		}

		this.messages.set(id, updatedMessage)
		return updatedMessage
	}

	/**
	 * Delete a message and its associated attachments
	 */
	deleteMessage(id: Snowflake): boolean {
		const message = this.messages.get(id)
		if (message) {
			// Clean up associated attachments
			for (const attachment of message.attachments) {
				this.attachments.delete(attachment.id)
			}
		}
		return this.messages.delete(id)
	}

	// ============================================================================
	// Reaction Operations (Phase 5I)
	// ============================================================================

	/**
	 * Add a reaction to a message
	 * Returns the updated reactions array or undefined if message not found
	 */
	addReaction(
		messageId: Snowflake,
		userId: Snowflake,
		emoji: { id: Snowflake | null; name: string }
	): MockReaction[] | undefined {
		const message = this.messages.get(messageId)
		if (!message) {
			return undefined
		}

		// Initialize reactions array if needed
		if (!message.reactions) {
			message.reactions = []
		}

		// Find existing reaction for this emoji
		const emojiKey = emoji.id || emoji.name
		const existingReaction = message.reactions.find(
			(r) => (r.emoji.id || r.emoji.name) === emojiKey
		)

		if (existingReaction) {
			// Increment count
			existingReaction.count++
			existingReaction.count_details.normal++
			// Mark as "me" if this is the current user (for Stage UI display)
			if (userId === this.currentUser.id) {
				existingReaction.me = true
			}
		} else {
			// Create new reaction
			const newReaction: MockReaction = {
				count: 1,
				count_details: { burst: 0, normal: 1 },
				me: userId === this.currentUser.id,
				me_burst: false,
				emoji: {
					id: emoji.id,
					name: emoji.name
				},
				burst_colors: []
			}
			message.reactions.push(newReaction)
		}

		return message.reactions
	}

	/**
	 * Remove a reaction from a message
	 * Returns the updated reactions array or undefined if message/reaction not found
	 */
	removeReaction(
		messageId: Snowflake,
		userId: Snowflake,
		emoji: { id: Snowflake | null; name: string }
	): MockReaction[] | undefined {
		const message = this.messages.get(messageId)
		if (!message || !message.reactions) {
			return undefined
		}

		// Find existing reaction for this emoji
		const emojiKey = emoji.id || emoji.name
		const reactionIndex = message.reactions.findIndex(
			(r) => (r.emoji.id || r.emoji.name) === emojiKey
		)

		if (reactionIndex === -1) {
			return message.reactions
		}

		const reaction = message.reactions[reactionIndex]
		reaction.count--
		reaction.count_details.normal--

		// Remove "me" flag if this is the current user
		if (userId === this.currentUser.id) {
			reaction.me = false
		}

		// Remove reaction entirely if count reaches 0
		if (reaction.count <= 0) {
			message.reactions.splice(reactionIndex, 1)
		}

		return message.reactions
	}

	// ============================================================================
	// Attachment Operations (Phase 4E)
	// Uses AttachmentStorage interface for pluggable backends
	// ============================================================================

	/**
	 * Store an attachment using the configured storage backend.
	 */
	storeAttachment(attachment: StoredAttachment): void {
		this.attachmentStorage.storeSync(attachment)
	}

	/**
	 * Get an attachment by ID.
	 */
	getAttachment(id: Snowflake): StoredAttachment | undefined {
		return this.attachmentStorage.getSync(id)
	}

	/**
	 * Delete an attachment by ID.
	 */
	deleteAttachment(id: Snowflake): boolean {
		return this.attachmentStorage.deleteSync(id)
	}

	/**
	 * Get all attachments for a message.
	 */
	getAttachmentsForMessage(messageId: Snowflake): StoredAttachment[] {
		return this.attachmentStorage.getForMessageSync(messageId)
	}

	// ============================================================================
	// DM Channel Operations
	// ============================================================================

	/**
	 * Create a DM channel key from two user IDs (sorted for consistency)
	 */
	private getDMKey(userId1: Snowflake, userId2: Snowflake): string {
		return [userId1, userId2].sort().join(':')
	}

	/**
	 * Get a DM channel by recipient user ID (uses currentUser as the other participant)
	 */
	getDMChannel(recipientId: Snowflake): MockChannel | undefined {
		const dmKey = this.getDMKey(this.currentUser.id, recipientId)
		return this.dmChannels.get(dmKey)
	}

	/**
	 * Get or create a DM channel for a recipient (uses currentUser as the other participant)
	 * The channel will be keyed by both user IDs for proper multi-user support.
	 */
	getOrCreateDMChannel(recipientId: Snowflake): MockChannel {
		const currentUserId = this.currentUser.id
		const dmKey = this.getDMKey(currentUserId, recipientId)

		let dmChannel = this.dmChannels.get(dmKey)
		if (!dmChannel) {
			dmChannel = createMockChannel({
				name: `DM-${recipientId}`,
				type: ChannelType.DM,
				recipientIds: [currentUserId, recipientId]
			})
			// Store in both maps:
			// - dmChannels keyed by sorted user IDs (for multi-user DM support)
			// - channels keyed by channel ID (for O(1) lookup)
			this.dmChannels.set(dmKey, dmChannel)
			this.channels.set(dmChannel.id, dmChannel)
		}
		return dmChannel
	}

	// ============================================================================
	// Interaction Operations (Phase 3A)
	// ============================================================================

	/**
	 * Get an interaction by ID
	 */
	getInteraction(id: Snowflake): MockInteraction | undefined {
		return this.interactions.get(id)
	}

	/**
	 * Get an interaction by token
	 */
	getInteractionByToken(token: string): MockInteraction | undefined {
		const id = this.interactionsByToken.get(token)
		return id ? this.interactions.get(id) : undefined
	}

	/**
	 * Add an interaction to the state
	 */
	addInteraction(interaction: MockInteraction): void {
		// Enforce max interactions limit (LRU-style)
		if (this.interactions.size >= this.maxInteractions) {
			// First try to cleanup expired
			this.cleanupExpiredInteractions()

			// If still at capacity, remove oldest
			if (this.interactions.size >= this.maxInteractions) {
				const oldest = this.interactions.keys().next().value
				if (oldest) {
					this.removeInteraction(oldest)
				}
			}
		}

		this.interactions.set(interaction.id, interaction)
		this.interactionsByToken.set(interaction.token, interaction.id)
	}

	/**
	 * Remove an interaction from the state
	 */
	removeInteraction(id: Snowflake): boolean {
		const interaction = this.interactions.get(id)
		if (interaction) {
			this.interactionsByToken.delete(interaction.token)
			return this.interactions.delete(id)
		}
		return false
	}

	/**
	 * Cleanup expired interactions (older than 15 minutes)
	 */
	cleanupExpiredInteractions(): void {
		const now = Date.now()
		for (const [id, interaction] of this.interactions) {
			if (now > interaction.expiresAt) {
				this.interactionsByToken.delete(interaction.token)
				this.interactions.delete(id)
			}
		}
	}

	// ============================================================================
	// Thread Operations (Phase 4D)
	// ============================================================================

	/**
	 * Check if a channel is a thread type (10, 11, or 12)
	 */
	isThread(channelId: Snowflake): boolean {
		const channel = this.channels.get(channelId)
		return channel?.type === 10 || channel?.type === 11 || channel?.type === 12
	}

	/**
	 * Get a thread by ID (returns undefined if not a thread)
	 */
	getThread(id: Snowflake): MockThread | undefined {
		const channel = this.channels.get(id)
		if (channel && (channel.type === 10 || channel.type === 11 || channel.type === 12)) {
			return channel as MockThread
		}
		return undefined
	}

	/**
	 * Get all threads for a parent channel
	 */
	getThreadsForChannel(channelId: Snowflake, options?: { archived?: boolean }): MockThread[] {
		const threads: MockThread[] = []
		for (const channel of this.channels.values()) {
			if (
				(channel.type === 10 || channel.type === 11 || channel.type === 12) &&
				channel.parentId === channelId
			) {
				const thread = channel as MockThread
				if (options?.archived === undefined || thread.threadMetadata.archived === options.archived) {
					threads.push(thread)
				}
			}
		}
		return threads
	}

	/**
	 * Get all active (non-archived) threads in a guild
	 */
	getActiveThreadsForGuild(guildId: Snowflake): MockThread[] {
		const threads: MockThread[] = []
		for (const channel of this.channels.values()) {
			if (
				(channel.type === 10 || channel.type === 11 || channel.type === 12) &&
				channel.guildId === guildId
			) {
				const thread = channel as MockThread
				if (!thread.threadMetadata.archived) {
					threads.push(thread)
				}
			}
		}
		return threads
	}

	/**
	 * Create a thread channel
	 */
	createThread(config: MockThreadConfig): MockThread {
		const thread = createMockThread(config)

		// Get guild ID from parent channel
		const parentChannel = this.channels.get(config.parentId)
		if (parentChannel?.guildId) {
			thread.guildId = parentChannel.guildId

			// Add to guild's channel list
			const guild = this.guilds.get(parentChannel.guildId)
			if (guild && !guild.channels.includes(thread.id)) {
				guild.channels.push(thread.id)
			}
		}

		// Store in channels map
		this.channels.set(thread.id, thread)

		// Initialize thread members map and add owner as first member
		const membersMap = new Map<Snowflake, MockThreadMember>()
		const ownerMember: MockThreadMember = {
			id: thread.id,
			user_id: thread.ownerId,
			join_timestamp: new Date().toISOString(),
			flags: 0
		}
		membersMap.set(thread.ownerId, ownerMember)
		this.threadMembers.set(thread.id, membersMap)

		return thread
	}

	/**
	 * Update thread metadata
	 */
	updateThread(
		threadId: Snowflake,
		updates: Partial<{
			name: string
			archived: boolean
			locked: boolean
			auto_archive_duration: 60 | 1440 | 4320 | 10080
			invitable: boolean
			rateLimitPerUser: number
		}>
	): MockThread | undefined {
		const thread = this.getThread(threadId)
		if (!thread) {
			return undefined
		}

		// Update name if provided
		if (updates.name !== undefined) {
			thread.name = updates.name
		}

		// Update thread metadata fields
		if (updates.archived !== undefined) {
			thread.threadMetadata.archived = updates.archived
			thread.threadMetadata.archive_timestamp = new Date().toISOString()
		}
		if (updates.locked !== undefined) {
			thread.threadMetadata.locked = updates.locked
		}
		if (updates.auto_archive_duration !== undefined) {
			thread.threadMetadata.auto_archive_duration = updates.auto_archive_duration
		}
		if (updates.invitable !== undefined && thread.type === 12) {
			thread.threadMetadata.invitable = updates.invitable
		}
		if (updates.rateLimitPerUser !== undefined) {
			thread.rateLimitPerUser = updates.rateLimitPerUser
		}

		return thread
	}

	/**
	 * Delete a thread
	 */
	deleteThread(threadId: Snowflake): boolean {
		const thread = this.getThread(threadId)
		if (!thread) {
			return false
		}

		// Remove from guild's channel list
		if (thread.guildId) {
			const guild = this.guilds.get(thread.guildId)
			if (guild) {
				const idx = guild.channels.indexOf(threadId)
				if (idx !== -1) {
					guild.channels.splice(idx, 1)
				}
			}
		}

		// Remove messages in this thread
		for (const [messageId, message] of this.messages) {
			if (message.channelId === threadId) {
				this.messages.delete(messageId)
			}
		}

		// Remove thread members
		this.threadMembers.delete(threadId)

		// Remove from channels
		return this.channels.delete(threadId)
	}

	/**
	 * Add a member to a thread
	 */
	addThreadMember(threadId: Snowflake, userId: Snowflake): MockThreadMember | undefined {
		const thread = this.getThread(threadId)
		if (!thread) {
			return undefined
		}

		// Get or create thread members map
		let membersMap = this.threadMembers.get(threadId)
		if (!membersMap) {
			membersMap = new Map()
			this.threadMembers.set(threadId, membersMap)
		}

		// Check if already a member
		if (membersMap.has(userId)) {
			return membersMap.get(userId)
		}

		// Create member
		const member: MockThreadMember = {
			id: threadId,
			user_id: userId,
			join_timestamp: new Date().toISOString(),
			flags: 0
		}
		membersMap.set(userId, member)

		// Update member count (capped at 50 for display)
		thread.memberCount = Math.min(membersMap.size, 50)

		return member
	}

	/**
	 * Remove a member from a thread
	 */
	removeThreadMember(threadId: Snowflake, userId: Snowflake): boolean {
		const thread = this.getThread(threadId)
		if (!thread) {
			return false
		}

		const membersMap = this.threadMembers.get(threadId)
		if (!membersMap) {
			return false
		}

		const removed = membersMap.delete(userId)
		if (removed) {
			// Update member count
			thread.memberCount = Math.min(membersMap.size, 50)
		}

		return removed
	}

	/**
	 * Get a thread member
	 */
	getThreadMember(threadId: Snowflake, userId: Snowflake): MockThreadMember | undefined {
		const membersMap = this.threadMembers.get(threadId)
		return membersMap?.get(userId)
	}

	/**
	 * Get all members of a thread
	 */
	getThreadMembers(threadId: Snowflake): MockThreadMember[] {
		const membersMap = this.threadMembers.get(threadId)
		return membersMap ? Array.from(membersMap.values()) : []
	}

	/**
	 * Increment thread message count and update activity timestamp
	 */
	incrementThreadMessageCount(threadId: Snowflake): void {
		const thread = this.getThread(threadId)
		if (thread) {
			thread.messageCount = Math.min((thread.messageCount || 0) + 1, 50)
			thread.totalMessageSent = (thread.totalMessageSent || 0) + 1
			// Update activity timestamp for auto-archive tracking
			thread.threadMetadata.last_activity_timestamp = new Date().toISOString()
		}
	}

	/**
	 * Check and archive inactive threads based on auto_archive_duration
	 * Returns array of thread IDs that were archived
	 */
	checkAutoArchiveThreads(): Snowflake[] {
		const archivedIds: Snowflake[] = []
		const now = Date.now()

		for (const [channelId, channel] of this.channels) {
			// Only check threads (types 10, 11, 12)
			if (channel.type !== 10 && channel.type !== 11 && channel.type !== 12) {
				continue
			}

			const thread = channel as MockThread

			// Skip already archived threads
			if (thread.threadMetadata.archived) {
				continue
			}

			// Get last activity time
			const lastActivity = thread.threadMetadata.last_activity_timestamp
				? new Date(thread.threadMetadata.last_activity_timestamp).getTime()
				: new Date(thread.threadMetadata.create_timestamp || new Date().toISOString()).getTime()

			// Calculate inactivity duration in minutes
			const inactiveMinutes = (now - lastActivity) / (1000 * 60)

			// Archive if inactive for longer than auto_archive_duration
			if (inactiveMinutes >= thread.threadMetadata.auto_archive_duration) {
				thread.threadMetadata.archived = true
				thread.threadMetadata.archive_timestamp = new Date().toISOString()
				archivedIds.push(channelId)
			}
		}

		return archivedIds
	}

	// ============================================================================
	// Forum & Media Channel Operations (Phase 4H)
	// ============================================================================

	/**
	 * Check if a channel is a forum or media channel (type 15 or 16)
	 */
	isForumChannel(channelId: Snowflake): boolean {
		const channel = this.channels.get(channelId)
		return channel?.type === 15 || channel?.type === 16
	}

	/**
	 * Get a forum channel by ID (returns undefined if not a forum/media channel)
	 */
	getForumChannel(id: Snowflake): MockForumChannel | undefined {
		const channel = this.channels.get(id)
		if (channel && (channel.type === 15 || channel.type === 16)) {
			return channel as MockForumChannel
		}
		return undefined
	}

	/**
	 * Get all forum/media channels in a guild
	 */
	getForumChannelsForGuild(guildId: Snowflake): MockForumChannel[] {
		const forumChannels: MockForumChannel[] = []
		for (const channel of this.channels.values()) {
			if ((channel.type === 15 || channel.type === 16) && channel.guildId === guildId) {
				forumChannels.push(channel as MockForumChannel)
			}
		}
		return forumChannels
	}

	/**
	 * Create a forum or media channel
	 */
	createForumChannel(config: MockForumChannelConfig): MockForumChannel {
		const channel = createMockForumChannel(config)

		// Set guild ID if provided
		if (config.guildId) {
			channel.guildId = config.guildId

			// Add to guild's channel list
			const guild = this.guilds.get(config.guildId)
			if (guild && !guild.channels.includes(channel.id)) {
				guild.channels.push(channel.id)
			}
		}

		// Store in channels map
		this.channels.set(channel.id, channel)

		return channel
	}

	/**
	 * Add a tag to a forum channel
	 */
	addForumTag(
		channelId: Snowflake,
		tag: Omit<MockForumTag, 'id'>
	): MockForumTag | undefined {
		const channel = this.getForumChannel(channelId)
		if (!channel) {
			return undefined
		}

		// Max 20 tags per forum channel
		if (channel.available_tags.length >= 20) {
			return undefined
		}

		// Validate tag name length
		if (tag.name.length > 20) {
			return undefined
		}

		const newTag: MockForumTag = {
			id: generateSnowflake(),
			...tag
		}

		channel.available_tags.push(newTag)
		return newTag
	}

	/**
	 * Remove a tag from a forum channel
	 */
	removeForumTag(channelId: Snowflake, tagId: Snowflake): boolean {
		const channel = this.getForumChannel(channelId)
		if (!channel) {
			return false
		}

		const index = channel.available_tags.findIndex((t) => t.id === tagId)
		if (index === -1) {
			return false
		}

		channel.available_tags.splice(index, 1)
		return true
	}

	/**
	 * Update a tag in a forum channel
	 */
	updateForumTag(
		channelId: Snowflake,
		tagId: Snowflake,
		updates: Partial<Omit<MockForumTag, 'id'>>
	): MockForumTag | undefined {
		const channel = this.getForumChannel(channelId)
		if (!channel) {
			return undefined
		}

		const tag = channel.available_tags.find((t) => t.id === tagId)
		if (!tag) {
			return undefined
		}

		// Validate name length if being updated
		if (updates.name !== undefined && updates.name.length > 20) {
			return undefined
		}

		// Apply updates
		if (updates.name !== undefined) tag.name = updates.name
		if (updates.moderated !== undefined) tag.moderated = updates.moderated
		if (updates.emoji_id !== undefined) tag.emoji_id = updates.emoji_id
		if (updates.emoji_name !== undefined) tag.emoji_name = updates.emoji_name

		return tag
	}

	/**
	 * Check if a thread is a forum thread (has applied_tags)
	 */
	isForumThread(threadId: Snowflake): boolean {
		const thread = this.getThread(threadId)
		if (!thread) return false

		const parent = this.channels.get(thread.parentId)
		return parent?.type === 15 || parent?.type === 16
	}

	/**
	 * Get a forum thread by ID (returns undefined if not a forum thread)
	 */
	getForumThread(id: Snowflake): MockForumThread | undefined {
		const thread = this.getThread(id)
		if (!thread) return undefined

		const parent = this.channels.get(thread.parentId)
		if (parent?.type !== 15 && parent?.type !== 16) {
			return undefined
		}

		// Cast to forum thread - it should have applied_tags
		return thread as unknown as MockForumThread
	}

	/**
	 * Create a forum post (thread with initial message)
	 */
	createForumPost(config: MockForumPostConfig): { thread: MockForumThread; message: MockMessage } {
		const forumChannel = this.getForumChannel(config.parentId)
		if (!forumChannel) {
			throw new Error(`Forum channel not found: ${config.parentId}`)
		}

		// Validate applied_tags (max 5, must exist in forum's available_tags)
		const appliedTags = config.applied_tags ?? []
		if (appliedTags.length > 5) {
			throw new Error('Forum posts can have at most 5 tags')
		}

		const validTagIds = new Set(forumChannel.available_tags.map((t) => t.id))
		for (const tagId of appliedTags) {
			if (!validTagIds.has(tagId)) {
				throw new Error(`Invalid tag ID: ${tagId}`)
			}
		}

		// Create the thread using the existing thread creation
		const ownerId = config.ownerId ?? this.botUser.id
		const threadType = 11 as const // Forum posts are always public threads

		const baseThread = createMockThread({
			name: config.name,
			type: threadType,
			parentId: config.parentId,
			ownerId,
			autoArchiveDuration: config.autoArchiveDuration ?? forumChannel.default_auto_archive_duration ?? 1440
		})

		// Convert to forum thread with applied_tags
		const thread: MockForumThread = {
			...baseThread,
			applied_tags: appliedTags
		}

		// Set guild ID from forum channel
		if (forumChannel.guildId) {
			thread.guildId = forumChannel.guildId

			// Add to guild's channel list
			const guild = this.guilds.get(forumChannel.guildId)
			if (guild && !guild.channels.includes(thread.id)) {
				guild.channels.push(thread.id)
			}
		}

		// Store in channels map
		this.channels.set(thread.id, thread)

		// Initialize thread members
		const membersMap = new Map<Snowflake, MockThreadMember>()
		const ownerMember: MockThreadMember = {
			id: thread.id,
			user_id: ownerId,
			join_timestamp: new Date().toISOString(),
			flags: 0
		}
		membersMap.set(ownerId, ownerMember)
		this.threadMembers.set(thread.id, membersMap)

		// Create the initial message
		const message = this.createMessage({
			channelId: thread.id,
			guildId: thread.guildId,
			authorId: ownerId,
			content: config.message.content,
			embeds: config.message.embeds,
			components: config.message.components,
			attachments: config.message.attachments as MockAttachment[]
		})

		// Update thread message counts
		thread.messageCount = 1
		thread.totalMessageSent = 1
		thread.lastMessageId = message.id

		return { thread, message }
	}

	/**
	 * Update applied tags on a forum thread
	 */
	updateForumThreadTags(threadId: Snowflake, appliedTags: Snowflake[]): MockForumThread | undefined {
		const thread = this.getForumThread(threadId)
		if (!thread) {
			return undefined
		}

		const forumChannel = this.getForumChannel(thread.parentId)
		if (!forumChannel) {
			return undefined
		}

		// Validate tags
		if (appliedTags.length > 5) {
			return undefined
		}

		const validTagIds = new Set(forumChannel.available_tags.map((t) => t.id))
		for (const tagId of appliedTags) {
			if (!validTagIds.has(tagId)) {
				return undefined
			}
		}

		thread.applied_tags = appliedTags
		return thread
	}

	/**
	 * Get posts (threads) in a forum channel
	 */
	getForumPosts(forumChannelId: Snowflake, options?: { archived?: boolean }): MockForumThread[] {
		const forumChannel = this.getForumChannel(forumChannelId)
		if (!forumChannel) {
			return []
		}

		const posts: MockForumThread[] = []
		for (const channel of this.channels.values()) {
			if (
				(channel.type === 10 || channel.type === 11 || channel.type === 12) &&
				channel.parentId === forumChannelId
			) {
				const thread = channel as MockThread
				if (options?.archived === undefined || thread.threadMetadata.archived === options.archived) {
					// Cast to forum thread
					posts.push(thread as unknown as MockForumThread)
				}
			}
		}
		return posts
	}

	// ============================================================================
	// Poll Operations (Phase 4G)
	// ============================================================================

	/**
	 * Add a vote to a poll
	 * @returns true if vote was added, false if already voted (single-select) or invalid
	 */
	addPollVote(messageId: Snowflake, userId: Snowflake, answerId: number): boolean {
		const message = this.getMessage(messageId)
		if (!message?.poll || message.poll.results?.is_finalized) {
			return false
		}

		// Validate answer exists
		const answerExists = message.poll.answers.some((a) => a.answer_id === answerId)
		if (!answerExists) {
			return false
		}

		// Get or create user votes for this message
		let messageVotes = this.pollVotes.get(messageId)
		if (!messageVotes) {
			messageVotes = new Map()
			this.pollVotes.set(messageId, messageVotes)
		}

		// Get user's current votes
		let userVotes = messageVotes.get(userId) ?? []

		// Check if already voted for this answer
		if (userVotes.includes(answerId)) {
			return false
		}

		// If single-select, replace existing vote
		if (!message.poll.allow_multiselect && userVotes.length > 0) {
			// Remove vote from previous answer count
			const previousAnswerId = userVotes[0]
			const prevCount = message.poll.results?.answer_counts.find((c) => c.id === previousAnswerId)
			if (prevCount && prevCount.count > 0) {
				prevCount.count--
			}
			userVotes = []
		}

		// Add vote
		userVotes.push(answerId)
		messageVotes.set(userId, userVotes)

		// Update results
		this.updatePollResults(messageId)

		return true
	}

	/**
	 * Remove a vote from a poll (only for multiselect polls)
	 * @returns true if vote was removed, false if not voted or invalid
	 */
	removePollVote(messageId: Snowflake, userId: Snowflake, answerId: number): boolean {
		const message = this.getMessage(messageId)
		if (!message?.poll || message.poll.results?.is_finalized) {
			return false
		}

		const messageVotes = this.pollVotes.get(messageId)
		if (!messageVotes) {
			return false
		}

		const userVotes = messageVotes.get(userId)
		if (!userVotes) {
			return false
		}

		const voteIndex = userVotes.indexOf(answerId)
		if (voteIndex === -1) {
			return false
		}

		// Remove vote
		userVotes.splice(voteIndex, 1)
		if (userVotes.length === 0) {
			messageVotes.delete(userId)
		}

		// Update results
		this.updatePollResults(messageId)

		return true
	}

	/**
	 * Get all users who voted for a specific answer
	 */
	getPollVoters(messageId: Snowflake, answerId: number): Snowflake[] {
		const messageVotes = this.pollVotes.get(messageId)
		if (!messageVotes) {
			return []
		}

		const voters: Snowflake[] = []
		for (const [userId, votes] of messageVotes) {
			if (votes.includes(answerId)) {
				voters.push(userId)
			}
		}

		return voters
	}

	/**
	 * Get all votes for a user on a poll
	 */
	getUserPollVotes(messageId: Snowflake, userId: Snowflake): number[] {
		const messageVotes = this.pollVotes.get(messageId)
		return messageVotes?.get(userId) ?? []
	}

	/**
	 * Update poll results based on current votes
	 */
	updatePollResults(messageId: Snowflake): void {
		const message = this.getMessage(messageId)
		if (!message?.poll) {
			return
		}

		const messageVotes = this.pollVotes.get(messageId)
		const voteCounts = new Map<number, number>()

		// Initialize counts for all answers
		for (const answer of message.poll.answers) {
			voteCounts.set(answer.answer_id, 0)
		}

		// Count votes
		if (messageVotes) {
			for (const votes of messageVotes.values()) {
				for (const answerId of votes) {
					voteCounts.set(answerId, (voteCounts.get(answerId) ?? 0) + 1)
				}
			}
		}

		// Update results
		message.poll.results = {
			is_finalized: message.poll.results?.is_finalized ?? false,
			answer_counts: message.poll.answers.map((a) => ({
				id: a.answer_id,
				count: voteCounts.get(a.answer_id) ?? 0,
				me_voted: false // Will be set per-user in API response
			}))
		}
	}

	/**
	 * Expire (finalize) a poll
	 * @returns true if poll was expired, false if already expired or no poll
	 */
	expirePoll(messageId: Snowflake): boolean {
		const message = this.getMessage(messageId)
		if (!message?.poll || message.poll.results?.is_finalized) {
			return false
		}

		// Finalize results
		this.updatePollResults(messageId)
		message.poll.results!.is_finalized = true
		message.poll.expiry = new Date().toISOString()

		return true
	}

	/**
	 * Check if a poll has expired and finalize it
	 * @returns true if poll was expired
	 */
	checkPollExpiry(messageId: Snowflake): boolean {
		const message = this.getMessage(messageId)
		if (!message?.poll || message.poll.results?.is_finalized) {
			return false
		}

		if (!message.poll.expiry) {
			return false
		}

		const expiryTime = new Date(message.poll.expiry).getTime()
		if (Date.now() >= expiryTime) {
			return this.expirePoll(messageId)
		}

		return false
	}

	// ============================================================================
	// Sticker Operations (Phase 4I)
	// ============================================================================

	/**
	 * Get a sticker by ID
	 */
	getSticker(stickerId: Snowflake): MockSticker | undefined {
		return this.stickers.get(stickerId)
	}

	/**
	 * Get all stickers for a guild
	 */
	getGuildStickers(guildId: Snowflake): MockSticker[] {
		const guild = this.guilds.get(guildId)
		if (!guild) {
			return []
		}
		return guild.stickers
			.map((id) => this.stickers.get(id))
			.filter((s): s is MockSticker => s !== undefined)
	}

	/**
	 * Create a guild sticker
	 * @returns The created sticker, or null if guild doesn't exist or limit reached
	 */
	createGuildSticker(guildId: Snowflake, config: MockStickerConfig, uploaderId: Snowflake): MockSticker | null {
		const guild = this.guilds.get(guildId)
		if (!guild) {
			return null
		}

		// Check guild sticker limit
		if (guild.stickers.length >= StickerLimits.MAX_GUILD_STICKERS) {
			return null
		}

		// Validate name length (2-30 characters)
		if (config.name.length < StickerLimits.MIN_NAME_LENGTH || config.name.length > StickerLimits.MAX_NAME_LENGTH) {
			return null
		}

		// Validate description length (empty or 2-100 characters)
		if (config.description && config.description.length > 0 && config.description.length < StickerLimits.MIN_DESCRIPTION_LENGTH) {
			return null
		}
		if (config.description && config.description.length > StickerLimits.MAX_DESCRIPTION_LENGTH) {
			return null
		}

		// Validate tags length (2-200 characters)
		if (config.tags.length < StickerLimits.MIN_TAGS_LENGTH || config.tags.length > StickerLimits.MAX_TAGS_LENGTH) {
			return null
		}

		const uploader = this.users.get(uploaderId)
		const sticker: MockSticker = {
			id: config.id ?? generateSnowflake(),
			name: config.name,
			description: config.description ?? null,
			tags: config.tags,
			type: StickerType.Guild,
			format_type: config.format_type ?? StickerFormatType.PNG,
			available: true,
			guild_id: guildId,
			user: uploader
		}

		this.stickers.set(sticker.id, sticker)
		guild.stickers.push(sticker.id)

		return sticker
	}

	/**
	 * Update a guild sticker
	 * @returns The updated sticker, or null if not found
	 */
	updateGuildSticker(
		stickerId: Snowflake,
		updates: { name?: string; description?: string; tags?: string }
	): MockSticker | null {
		const sticker = this.stickers.get(stickerId)
		if (!sticker || sticker.type !== StickerType.Guild) {
			return null
		}

		// Validate name length (2-30 characters)
		if (updates.name !== undefined) {
			if (updates.name.length < StickerLimits.MIN_NAME_LENGTH || updates.name.length > StickerLimits.MAX_NAME_LENGTH) {
				return null
			}
			sticker.name = updates.name
		}

		// Validate description length (empty or 2-100 characters)
		if (updates.description !== undefined) {
			if (updates.description.length > 0 && updates.description.length < StickerLimits.MIN_DESCRIPTION_LENGTH) {
				return null
			}
			if (updates.description.length > StickerLimits.MAX_DESCRIPTION_LENGTH) {
				return null
			}
			sticker.description = updates.description
		}

		// Validate tags length (2-200 characters)
		if (updates.tags !== undefined) {
			if (updates.tags.length < StickerLimits.MIN_TAGS_LENGTH || updates.tags.length > StickerLimits.MAX_TAGS_LENGTH) {
				return null
			}
			sticker.tags = updates.tags
		}

		return sticker
	}

	/**
	 * Delete a guild sticker
	 * @returns true if deleted, false if not found
	 */
	deleteGuildSticker(stickerId: Snowflake): boolean {
		const sticker = this.stickers.get(stickerId)
		if (!sticker || sticker.type !== StickerType.Guild || !sticker.guild_id) {
			return false
		}

		// Remove from guild's sticker list
		const guild = this.guilds.get(sticker.guild_id)
		if (guild) {
			const index = guild.stickers.indexOf(stickerId)
			if (index !== -1) {
				guild.stickers.splice(index, 1)
			}
		}

		// Remove from stickers map
		this.stickers.delete(stickerId)
		return true
	}

	/**
	 * Add a sticker directly to state (for control API)
	 * This allows adding standard/nitro stickers without a guild
	 */
	addSticker(sticker: MockSticker): void {
		this.stickers.set(sticker.id, sticker)
	}

	// ============================================================================
	// Webhook Operations (Phase 4J)
	// ============================================================================

	/**
	 * Generate a secure webhook token (68 characters like Discord's format)
	 */
	private generateWebhookToken(): string {
		// Discord webhook tokens are approximately 68 characters, base64-like
		return randomBytes(51).toString('base64url')
	}

	/**
	 * Get a webhook by ID
	 */
	getWebhook(webhookId: Snowflake): MockWebhook | undefined {
		return this.webhooks.get(webhookId)
	}

	/**
	 * Get a webhook by its token
	 */
	getWebhookByToken(token: string): MockWebhook | undefined {
		const webhookId = this.webhooksByToken.get(token)
		if (!webhookId) {
			return undefined
		}
		return this.webhooks.get(webhookId)
	}

	/**
	 * Get all webhooks for a channel
	 */
	getWebhooksForChannel(channelId: Snowflake): MockWebhook[] {
		return Array.from(this.webhooks.values()).filter((w) => w.channel_id === channelId)
	}

	/**
	 * Get all webhooks for a guild
	 */
	getWebhooksForGuild(guildId: Snowflake): MockWebhook[] {
		return Array.from(this.webhooks.values()).filter((w) => w.guild_id === guildId)
	}

	/**
	 * Create a webhook
	 * @returns The created webhook, or null if channel doesn't exist or limit reached
	 */
	createWebhook(channelId: Snowflake, config: MockWebhookConfig, creatorId: Snowflake): MockWebhook | null {
		const channel = this.channels.get(channelId)
		if (!channel) {
			return null
		}

		// Check channel webhook limit
		const channelWebhooks = this.getWebhooksForChannel(channelId)
		if (channelWebhooks.length >= WebhookLimits.MAX_WEBHOOKS_PER_CHANNEL) {
			return null
		}

		// Validate name
		if (!config.name || config.name.length < WebhookLimits.MIN_NAME_LENGTH || config.name.length > WebhookLimits.MAX_NAME_LENGTH) {
			return null
		}

		const creator = this.users.get(creatorId)
		const webhookId = config.id ?? generateSnowflake()
		const token = this.generateWebhookToken()

		const webhook: MockWebhook = {
			id: webhookId,
			type: WebhookType.Incoming,
			guild_id: channel.guildId,
			channel_id: channelId,
			user: creator,
			name: config.name,
			avatar: config.avatar ?? null,
			token,
			application_id: null
		}

		this.webhooks.set(webhookId, webhook)
		this.webhooksByToken.set(token, webhookId)

		return webhook
	}

	/**
	 * Update a webhook
	 * @returns The updated webhook, or null if not found
	 */
	updateWebhook(
		webhookId: Snowflake,
		updates: { name?: string; avatar?: string | null; channel_id?: Snowflake }
	): MockWebhook | null {
		const webhook = this.webhooks.get(webhookId)
		if (!webhook) {
			return null
		}

		// Validate name length
		if (updates.name !== undefined) {
			if (updates.name.length < WebhookLimits.MIN_NAME_LENGTH || updates.name.length > WebhookLimits.MAX_NAME_LENGTH) {
				return null
			}
			webhook.name = updates.name
		}

		// Update avatar
		if (updates.avatar !== undefined) {
			webhook.avatar = updates.avatar
		}

		// Move to different channel
		if (updates.channel_id !== undefined) {
			const newChannel = this.channels.get(updates.channel_id)
			if (!newChannel) {
				return null // Target channel doesn't exist
			}

			// Check target channel webhook limit
			const targetWebhooks = this.getWebhooksForChannel(updates.channel_id)
			if (targetWebhooks.length >= WebhookLimits.MAX_WEBHOOKS_PER_CHANNEL) {
				return null
			}

			webhook.channel_id = updates.channel_id
			webhook.guild_id = newChannel.guildId
		}

		return webhook
	}

	/**
	 * Delete a webhook
	 * @returns true if deleted, false if not found
	 */
	deleteWebhook(webhookId: Snowflake): boolean {
		const webhook = this.webhooks.get(webhookId)
		if (!webhook) {
			return false
		}

		// Remove from token lookup
		if (webhook.token) {
			this.webhooksByToken.delete(webhook.token)
		}

		// Remove from webhooks map
		this.webhooks.delete(webhookId)
		return true
	}

	// ============================================================================
	// Emoji Operations (Phase 4K)
	// ============================================================================

	/**
	 * Get an emoji by ID
	 */
	getEmoji(emojiId: Snowflake): MockEmoji | undefined {
		return this.emojis.get(emojiId)
	}

	/**
	 * Get all emojis for a guild
	 */
	getGuildEmojis(guildId: Snowflake): MockEmoji[] {
		const guild = this.guilds.get(guildId)
		if (!guild) {
			return []
		}
		return guild.emojis
			.map((id) => this.emojis.get(id))
			.filter((e): e is MockEmoji => e !== undefined)
	}

	/**
	 * Create a guild emoji
	 * @returns The created emoji, or null if guild doesn't exist or limit reached
	 */
	createGuildEmoji(guildId: Snowflake, config: MockEmojiConfig, uploaderId: Snowflake): MockEmoji | null {
		const guild = this.guilds.get(guildId)
		if (!guild) {
			return null
		}

		// Check guild emoji limit
		if (guild.emojis.length >= EmojiLimits.MAX_GUILD_EMOJIS) {
			return null
		}

		// Validate name length
		if (config.name.length < EmojiLimits.MIN_NAME_LENGTH || config.name.length > EmojiLimits.MAX_NAME_LENGTH) {
			return null
		}

		// Validate name pattern (alphanumeric and underscores only)
		if (!EmojiLimits.NAME_PATTERN.test(config.name)) {
			return null
		}

		const uploader = this.users.get(uploaderId)
		const emojiId = config.id ?? generateSnowflake()
		const emoji: MockEmoji = {
			id: emojiId,
			name: config.name,
			roles: config.roles ?? [],
			user: uploader,
			require_colons: true,
			managed: false,
			animated: config.animated ?? false,
			available: true
		}

		this.emojis.set(emojiId, emoji)
		guild.emojis.push(emojiId)

		return emoji
	}

	/**
	 * Update a guild emoji
	 * @returns The updated emoji, or null if not found
	 */
	updateGuildEmoji(emojiId: Snowflake, updates: { name?: string; roles?: Snowflake[] }): MockEmoji | null {
		const emoji = this.emojis.get(emojiId)
		if (!emoji || !emoji.id) {
			return null
		}

		// Validate name if provided
		if (updates.name !== undefined) {
			// Validate length
			if (updates.name.length < EmojiLimits.MIN_NAME_LENGTH || updates.name.length > EmojiLimits.MAX_NAME_LENGTH) {
				return null
			}
			// Validate pattern (alphanumeric and underscores only)
			if (!EmojiLimits.NAME_PATTERN.test(updates.name)) {
				return null
			}
			emoji.name = updates.name
		}

		// Update roles if provided
		if (updates.roles !== undefined) {
			emoji.roles = updates.roles
		}

		return emoji
	}

	/**
	 * Delete a guild emoji
	 * @returns true if deleted, false if not found
	 */
	deleteGuildEmoji(emojiId: Snowflake): boolean {
		const emoji = this.emojis.get(emojiId)
		if (!emoji || !emoji.id) {
			return false
		}

		// Find the guild that owns this emoji and remove from its list
		for (const guild of this.guilds.values()) {
			const index = guild.emojis.indexOf(emojiId)
			if (index !== -1) {
				guild.emojis.splice(index, 1)
				break
			}
		}

		// Remove from emojis map
		this.emojis.delete(emojiId)
		return true
	}

	// ============================================================================
	// Role Operations (Phase 4L)
	// ============================================================================

	/**
	 * Default permissions for @everyone role
	 * Includes: ViewChannel, SendMessages, ReadMessageHistory, AddReactions, etc.
	 */
	private static readonly DEFAULT_EVERYONE_PERMISSIONS = '1071698660929'

	/**
	 * Default permissions for new roles (none)
	 */
	private static readonly DEFAULT_ROLE_PERMISSIONS = '0'

	/**
	 * Get all roles for a guild
	 */
	getGuildRoles(guildId: Snowflake): MockRole[] {
		const guild = this.guilds.get(guildId)
		if (!guild) {
			return []
		}
		return guild.roles.map((roleId) => this.roles.get(roleId)).filter((r): r is MockRole => r !== undefined)
	}

	/**
	 * Get a role by ID
	 */
	getRole(roleId: Snowflake): MockRole | undefined {
		return this.roles.get(roleId)
	}

	/**
	 * Get a role by ID within a guild
	 */
	getGuildRole(guildId: Snowflake, roleId: Snowflake): MockRole | undefined {
		const guild = this.guilds.get(guildId)
		if (!guild || !guild.roles.includes(roleId)) {
			return undefined
		}
		return this.roles.get(roleId)
	}

	/**
	 * Create the @everyone role for a guild
	 * Called automatically when a guild is created
	 */
	createEveryoneRole(guildId: Snowflake): MockRole {
		const role: MockRole = {
			id: guildId, // @everyone role has same ID as guild
			guildId,
			name: '@everyone',
			color: 0,
			hoist: false,
			position: 0,
			permissions: MockServerState.DEFAULT_EVERYONE_PERMISSIONS,
			managed: false,
			mentionable: false,
			flags: 0
		}
		this.roles.set(role.id, role)
		return role
	}

	/**
	 * Create a new role in a guild
	 * @returns The created role, or null if guild doesn't exist or limit reached
	 */
	createGuildRole(guildId: Snowflake, config?: MockRoleConfig): MockRole | null {
		const guild = this.guilds.get(guildId)
		if (!guild) {
			return null
		}

		// Check role limit (excluding @everyone)
		if (guild.roles.length >= RoleLimits.MAX_ROLES_PER_GUILD) {
			return null
		}

		// Validate name length
		const name = config?.name ?? 'new role'
		if (name.length < RoleLimits.MIN_NAME_LENGTH || name.length > RoleLimits.MAX_NAME_LENGTH) {
			return null
		}

		// Validate color
		const color = config?.color ?? 0
		if (color < 0 || color > RoleLimits.MAX_COLOR_VALUE) {
			return null
		}

		// Calculate position (new roles go above @everyone, below all others by default)
		const position = config?.position ?? 1

		const role: MockRole = {
			id: config?.id ?? generateSnowflake(),
			guildId,
			name,
			color,
			hoist: config?.hoist ?? false,
			icon: config?.icon ?? null,
			unicodeEmoji: config?.unicodeEmoji ?? null,
			position,
			permissions: config?.permissions ?? MockServerState.DEFAULT_ROLE_PERMISSIONS,
			managed: config?.managed ?? false,
			mentionable: config?.mentionable ?? false,
			tags: config?.tags,
			flags: 0
		}

		this.roles.set(role.id, role)
		guild.roles.push(role.id)

		// Create audit log entry for role creation
		this.createAuditLogEntry(guildId, {
			targetId: role.id,
			actionType: AuditLogEvent.RoleCreate,
			reason: config?.reason,
			changes: [
				{ key: 'name', new_value: role.name },
				{ key: 'color', new_value: role.color },
				{ key: 'hoist', new_value: role.hoist },
				{ key: 'mentionable', new_value: role.mentionable },
				{ key: 'permissions', new_value: role.permissions }
			]
		})

		return role
	}

	/**
	 * Update a role
	 * @returns The updated role, or null if not found
	 */
	updateGuildRole(guildId: Snowflake, roleId: Snowflake, updates: Partial<MockRoleConfig>, reason?: string): MockRole | null {
		const role = this.getGuildRole(guildId, roleId)
		if (!role) {
			return null
		}

		// Cannot modify @everyone's name or hoist
		if (role.id === guildId) {
			if (updates.name !== undefined || updates.hoist !== undefined) {
				return null
			}
		}

		// Track changes for audit log
		const changes: Array<{ key: string; old_value?: unknown; new_value?: unknown }> = []

		// Validate name length
		if (updates.name !== undefined) {
			if (updates.name.length < RoleLimits.MIN_NAME_LENGTH || updates.name.length > RoleLimits.MAX_NAME_LENGTH) {
				return null
			}
			changes.push({ key: 'name', old_value: role.name, new_value: updates.name })
			role.name = updates.name
		}

		// Validate and update color
		if (updates.color !== undefined) {
			if (updates.color < 0 || updates.color > RoleLimits.MAX_COLOR_VALUE) {
				return null
			}
			changes.push({ key: 'color', old_value: role.color, new_value: updates.color })
			role.color = updates.color
		}

		// Update other fields
		if (updates.hoist !== undefined) {
			changes.push({ key: 'hoist', old_value: role.hoist, new_value: updates.hoist })
			role.hoist = updates.hoist
		}
		if (updates.icon !== undefined) {
			changes.push({ key: 'icon', old_value: role.icon, new_value: updates.icon })
			role.icon = updates.icon
		}
		if (updates.unicodeEmoji !== undefined) {
			changes.push({ key: 'unicode_emoji', old_value: role.unicodeEmoji, new_value: updates.unicodeEmoji })
			role.unicodeEmoji = updates.unicodeEmoji
		}
		if (updates.permissions !== undefined) {
			changes.push({ key: 'permissions', old_value: role.permissions, new_value: updates.permissions })
			role.permissions = updates.permissions
		}
		if (updates.mentionable !== undefined) {
			changes.push({ key: 'mentionable', old_value: role.mentionable, new_value: updates.mentionable })
			role.mentionable = updates.mentionable
		}

		// Create audit log entry for role update
		if (changes.length > 0) {
			this.createAuditLogEntry(guildId, {
				targetId: role.id,
				actionType: AuditLogEvent.RoleUpdate,
				changes,
				reason
			})
		}

		return role
	}

	/**
	 * Update role positions in batch
	 * @returns The updated roles
	 */
	updateGuildRolePositions(guildId: Snowflake, positions: Array<{ id: Snowflake; position: number }>): MockRole[] {
		const guild = this.guilds.get(guildId)
		if (!guild) {
			return []
		}

		const updatedRoles: MockRole[] = []
		for (const { id, position } of positions) {
			// Cannot change @everyone's position (always 0)
			if (id === guildId) {
				continue
			}

			const role = this.roles.get(id)
			if (role && role.guildId === guildId) {
				role.position = position
				updatedRoles.push(role)
			}
		}

		return updatedRoles
	}

	/**
	 * Delete a role from a guild
	 * @returns true if deleted, false if not found or cannot delete @everyone
	 */
	deleteGuildRole(guildId: Snowflake, roleId: Snowflake, reason?: string): boolean {
		const guild = this.guilds.get(guildId)
		if (!guild) {
			return false
		}

		// Cannot delete @everyone role
		if (roleId === guildId) {
			return false
		}

		const role = this.roles.get(roleId)
		if (!role || role.guildId !== guildId) {
			return false
		}

		// Create audit log entry for role deletion (before deletion)
		this.createAuditLogEntry(guildId, {
			targetId: role.id,
			actionType: AuditLogEvent.RoleDelete,
			changes: [
				{ key: 'name', old_value: role.name },
				{ key: 'color', old_value: role.color },
				{ key: 'hoist', old_value: role.hoist },
				{ key: 'mentionable', old_value: role.mentionable },
				{ key: 'permissions', old_value: role.permissions }
			],
			reason
		})

		// Remove from guild's role list
		const index = guild.roles.indexOf(roleId)
		if (index !== -1) {
			guild.roles.splice(index, 1)
		}

		// Remove from all members
		for (const member of this.guildMembers.values()) {
			if (member.guildId === guildId) {
				const roleIndex = member.roles.indexOf(roleId)
				if (roleIndex !== -1) {
					member.roles.splice(roleIndex, 1)
				}
			}
		}

		// Remove from roles map
		this.roles.delete(roleId)
		return true
	}

	// ============================================================================
	// Guild Member Operations (Phase 4L)
	// ============================================================================

	/**
	 * Get a guild member
	 */
	getGuildMember(guildId: Snowflake, userId: Snowflake): MockGuildMember | undefined {
		return this.guildMembers.get(`${guildId}:${userId}`)
	}

	/**
	 * Get all members of a guild
	 */
	getGuildMembers(guildId: Snowflake): MockGuildMember[] {
		const members: MockGuildMember[] = []
		for (const member of this.guildMembers.values()) {
			if (member.guildId === guildId) {
				members.push(member)
			}
		}
		return members
	}

	/**
	 * Create or add a member to a guild
	 * @returns The created/existing member, or null if guild doesn't exist
	 */
	createGuildMember(guildId: Snowflake, userId: Snowflake, config?: MockGuildMemberConfig): MockGuildMember | null {
		const guild = this.guilds.get(guildId)
		if (!guild) {
			return null
		}

		const key = `${guildId}:${userId}`
		const existingMember = this.guildMembers.get(key)
		if (existingMember) {
			return existingMember
		}

		const member: MockGuildMember = {
			userId,
			guildId,
			roles: config?.roles ?? [],
			nick: config?.nick ?? null,
			joinedAt: new Date().toISOString(),
			premiumSince: null,
			deaf: config?.deaf ?? false,
			mute: config?.mute ?? false,
			pending: false,
			communicationDisabledUntil: config?.communicationDisabledUntil ?? null,
			flags: 0
		}

		this.guildMembers.set(key, member)

		// Add user ID to guild's member list if not already there
		if (!guild.members.includes(userId)) {
			guild.members.push(userId)
		}

		return member
	}

	/**
	 * Update a guild member
	 * @returns The updated member, or null if not found
	 */
	updateGuildMember(guildId: Snowflake, userId: Snowflake, updates: Partial<MockGuildMemberConfig>): MockGuildMember | null {
		const member = this.getGuildMember(guildId, userId)
		if (!member) {
			return null
		}

		if (updates.nick !== undefined) member.nick = updates.nick
		if (updates.roles !== undefined) member.roles = updates.roles
		if (updates.deaf !== undefined) member.deaf = updates.deaf
		if (updates.mute !== undefined) member.mute = updates.mute
		if (updates.communicationDisabledUntil !== undefined) {
			member.communicationDisabledUntil = updates.communicationDisabledUntil
		}

		return member
	}

	/**
	 * Remove a member from a guild
	 * @returns true if removed, false if not found
	 */
	removeGuildMember(guildId: Snowflake, userId: Snowflake): boolean {
		const guild = this.guilds.get(guildId)
		if (!guild) {
			return false
		}

		const key = `${guildId}:${userId}`
		if (!this.guildMembers.has(key)) {
			return false
		}

		this.guildMembers.delete(key)

		// Remove from guild's member list
		const index = guild.members.indexOf(userId)
		if (index !== -1) {
			guild.members.splice(index, 1)
		}

		return true
	}

	/**
	 * Add a role to a member
	 * @returns true if added, false if member/role not found or already has role
	 */
	addMemberRole(guildId: Snowflake, userId: Snowflake, roleId: Snowflake): boolean {
		const member = this.getGuildMember(guildId, userId)
		if (!member) {
			return false
		}

		// Verify role exists and belongs to the guild
		const role = this.roles.get(roleId)
		if (!role || role.guildId !== guildId) {
			return false
		}

		// Cannot add @everyone (implicit)
		if (roleId === guildId) {
			return false
		}

		// Check if already has role
		if (member.roles.includes(roleId)) {
			return false
		}

		member.roles.push(roleId)
		return true
	}

	/**
	 * Remove a role from a member
	 * @returns true if removed, false if member not found or doesn't have role
	 */
	removeMemberRole(guildId: Snowflake, userId: Snowflake, roleId: Snowflake): boolean {
		const member = this.getGuildMember(guildId, userId)
		if (!member) {
			return false
		}

		// Cannot remove @everyone (implicit)
		if (roleId === guildId) {
			return false
		}

		const index = member.roles.indexOf(roleId)
		if (index === -1) {
			return false
		}

		member.roles.splice(index, 1)
		return true
	}

	// ============================================================================
	// Channel Permission Overwrite Operations (Phase 4L)
	// ============================================================================

	/**
	 * Get permission overwrites for a channel
	 */
	getChannelOverwrites(channelId: Snowflake): MockChannelOverwrite[] {
		const channel = this.channels.get(channelId)
		return channel?.permissionOverwrites ?? []
	}

	/**
	 * Set a permission overwrite on a channel
	 * Creates or updates the overwrite for the given role/member ID
	 */
	setChannelOverwrite(channelId: Snowflake, overwrite: MockChannelOverwrite): boolean {
		const channel = this.channels.get(channelId)
		if (!channel) {
			return false
		}

		if (!channel.permissionOverwrites) {
			channel.permissionOverwrites = []
		}

		// Find existing overwrite
		const existingIndex = channel.permissionOverwrites.findIndex((o) => o.id === overwrite.id)
		if (existingIndex !== -1) {
			channel.permissionOverwrites[existingIndex] = overwrite
		} else {
			channel.permissionOverwrites.push(overwrite)
		}

		return true
	}

	/**
	 * Delete a permission overwrite from a channel
	 * @returns true if deleted, false if not found
	 */
	deleteChannelOverwrite(channelId: Snowflake, overwriteId: Snowflake): boolean {
		const channel = this.channels.get(channelId)
		if (!channel || !channel.permissionOverwrites) {
			return false
		}

		const index = channel.permissionOverwrites.findIndex((o) => o.id === overwriteId)
		if (index === -1) {
			return false
		}

		channel.permissionOverwrites.splice(index, 1)
		return true
	}

	// ============================================================================
	// Guild Ban Operations (Phase 4L-B)
	// ============================================================================

	/**
	 * Get a ban for a specific user in a guild
	 */
	getBan(guildId: Snowflake, userId: Snowflake): MockBan | undefined {
		return this.bans.get(`${guildId}:${userId}`)
	}

	/**
	 * Get all bans for a guild
	 */
	getGuildBans(guildId: Snowflake): MockBan[] {
		const bans: MockBan[] = []
		for (const ban of this.bans.values()) {
			if (ban.guildId === guildId) {
				bans.push(ban)
			}
		}
		return bans
	}

	/**
	 * Create a ban for a user in a guild
	 * Also removes the member from the guild if they're a member
	 * @returns The created ban, or null if guild doesn't exist
	 */
	createBan(guildId: Snowflake, userId: Snowflake, config?: MockBanConfig): MockBan | null {
		const guild = this.guilds.get(guildId)
		if (!guild) {
			return null
		}

		const key = `${guildId}:${userId}`

		// Check if already banned
		const existingBan = this.bans.get(key)
		if (existingBan) {
			return existingBan
		}

		// Validate reason length
		let reason = config?.reason ?? null
		if (reason && reason.length > BanLimits.MAX_REASON_LENGTH) {
			reason = reason.substring(0, BanLimits.MAX_REASON_LENGTH)
		}

		const ban: MockBan = {
			guildId,
			userId,
			reason,
			createdAt: new Date().toISOString()
		}

		this.bans.set(key, ban)

		// Remove member from guild if they're a member
		this.removeGuildMember(guildId, userId)

		return ban
	}

	/**
	 * Remove a ban for a user in a guild
	 * @returns true if removed, false if not found
	 */
	removeBan(guildId: Snowflake, userId: Snowflake): boolean {
		const key = `${guildId}:${userId}`
		if (!this.bans.has(key)) {
			return false
		}
		this.bans.delete(key)
		return true
	}

	/**
	 * Check if a user is banned from a guild
	 */
	isBanned(guildId: Snowflake, userId: Snowflake): boolean {
		return this.bans.has(`${guildId}:${userId}`)
	}

	// ============================================================================
	// Application Command Operations (Phase 4M)
	// ============================================================================

	/**
	 * Get a command by ID
	 */
	getCommand(commandId: Snowflake): MockApplicationCommand | undefined {
		return this.commands.get(commandId)
	}

	/**
	 * Get all global commands (no guild_id)
	 */
	getGlobalCommands(): MockApplicationCommand[] {
		return Array.from(this.commands.values()).filter((c) => !c.guild_id)
	}

	/**
	 * Get all commands for a specific guild
	 */
	getGuildCommands(guildId: Snowflake): MockApplicationCommand[] {
		return Array.from(this.commands.values()).filter((c) => c.guild_id === guildId)
	}

	/**
	 * Find a command by name within a scope (global or guild)
	 */
	findCommandByName(name: string, guildId?: Snowflake): MockApplicationCommand | undefined {
		return Array.from(this.commands.values()).find(
			(c) => c.name === name && c.guild_id === guildId
		)
	}

	/**
	 * Create a new application command
	 * @returns The created command, or null if validation fails
	 */
	createCommand(config: MockApplicationCommandConfig, guildId?: Snowflake): MockApplicationCommand | null {
		const type = config.type ?? ApplicationCommandType.ChatInput

		// Validate name
		if (!config.name || config.name.length < CommandLimits.MIN_NAME_LENGTH || config.name.length > CommandLimits.MAX_NAME_LENGTH) {
			return null
		}

		// For CHAT_INPUT commands, validate name pattern (lowercase, no spaces)
		if (type === ApplicationCommandType.ChatInput) {
			if (!CommandLimits.CHAT_INPUT_NAME_PATTERN.test(config.name.toLowerCase())) {
				return null
			}
		}

		// Validate description for CHAT_INPUT
		if (type === ApplicationCommandType.ChatInput) {
			if (!config.description || config.description.length < CommandLimits.MIN_DESCRIPTION_LENGTH || config.description.length > CommandLimits.MAX_DESCRIPTION_LENGTH) {
				return null
			}
		}

		// Validate options count
		if (config.options && config.options.length > CommandLimits.MAX_OPTIONS) {
			return null
		}

		// Check command limit for scope
		const existingCommands = guildId ? this.getGuildCommands(guildId) : this.getGlobalCommands()
		const maxCommands = guildId ? CommandLimits.MAX_GUILD_COMMANDS : CommandLimits.MAX_GLOBAL_COMMANDS
		if (existingCommands.length >= maxCommands) {
			return null
		}

		// Check for duplicate name within scope
		if (this.findCommandByName(config.name, guildId)) {
			return null
		}

		const command: MockApplicationCommand = {
			id: config.id ?? generateSnowflake(),
			type,
			application_id: this.applicationId,
			guild_id: guildId,
			name: type === ApplicationCommandType.ChatInput ? config.name.toLowerCase() : config.name,
			name_localizations: config.name_localizations ?? null,
			description: config.description ?? '',
			description_localizations: config.description_localizations ?? null,
			options: config.options,
			default_member_permissions: config.default_member_permissions ?? null,
			dm_permission: config.dm_permission,
			nsfw: config.nsfw,
			integration_types: config.integration_types,
			contexts: config.contexts,
			version: generateSnowflake()
		}

		this.commands.set(command.id, command)
		return command
	}

	/**
	 * Update an existing command
	 * @returns The updated command, or null if not found
	 */
	updateCommand(commandId: Snowflake, updates: Partial<MockApplicationCommandConfig>): MockApplicationCommand | null {
		const command = this.commands.get(commandId)
		if (!command) {
			return null
		}

		// Validate name if provided
		if (updates.name !== undefined) {
			if (updates.name.length < CommandLimits.MIN_NAME_LENGTH || updates.name.length > CommandLimits.MAX_NAME_LENGTH) {
				return null
			}

			// Check for CHAT_INPUT name pattern
			if (command.type === ApplicationCommandType.ChatInput) {
				if (!CommandLimits.CHAT_INPUT_NAME_PATTERN.test(updates.name.toLowerCase())) {
					return null
				}
			}

			// Check for duplicate name (excluding self)
			const existingCommand = this.findCommandByName(updates.name, command.guild_id)
			if (existingCommand && existingCommand.id !== commandId) {
				return null
			}
		}

		// Validate description if provided
		if (updates.description !== undefined && command.type === ApplicationCommandType.ChatInput) {
			if (updates.description.length < CommandLimits.MIN_DESCRIPTION_LENGTH || updates.description.length > CommandLimits.MAX_DESCRIPTION_LENGTH) {
				return null
			}
		}

		// Validate options if provided
		if (updates.options !== undefined && updates.options.length > CommandLimits.MAX_OPTIONS) {
			return null
		}

		// Apply updates
		if (updates.name !== undefined) {
			command.name = command.type === ApplicationCommandType.ChatInput ? updates.name.toLowerCase() : updates.name
		}
		if (updates.name_localizations !== undefined) command.name_localizations = updates.name_localizations
		if (updates.description !== undefined) command.description = updates.description
		if (updates.description_localizations !== undefined) command.description_localizations = updates.description_localizations
		if (updates.options !== undefined) command.options = updates.options
		if (updates.default_member_permissions !== undefined) command.default_member_permissions = updates.default_member_permissions
		if (updates.dm_permission !== undefined) command.dm_permission = updates.dm_permission
		if (updates.nsfw !== undefined) command.nsfw = updates.nsfw
		if (updates.integration_types !== undefined) command.integration_types = updates.integration_types
		if (updates.contexts !== undefined) command.contexts = updates.contexts

		// Update version on any change
		command.version = generateSnowflake()

		return command
	}

	/**
	 * Delete a command by ID
	 * @returns true if deleted, false if not found
	 */
	deleteCommand(commandId: Snowflake): boolean {
		return this.commands.delete(commandId)
	}

	/**
	 * Bulk overwrite commands for a scope (global or guild)
	 * Replaces all existing commands with the provided ones
	 * @returns Array of created commands, or null if validation fails
	 */
	bulkOverwriteCommands(configs: MockApplicationCommandConfig[], guildId?: Snowflake): MockApplicationCommand[] | null {
		// Validate count
		const maxCommands = guildId ? CommandLimits.MAX_GUILD_COMMANDS : CommandLimits.MAX_GLOBAL_COMMANDS
		if (configs.length > maxCommands) {
			return null
		}

		// Check for duplicate names
		const names = new Set<string>()
		for (const config of configs) {
			const name = config.name.toLowerCase()
			if (names.has(name)) {
				return null // Duplicate name
			}
			names.add(name)
		}

		// Validate all configs first
		for (const config of configs) {
			const type = config.type ?? ApplicationCommandType.ChatInput

			// Validate name
			if (!config.name || config.name.length < CommandLimits.MIN_NAME_LENGTH || config.name.length > CommandLimits.MAX_NAME_LENGTH) {
				return null
			}

			// For CHAT_INPUT commands, validate name pattern
			if (type === ApplicationCommandType.ChatInput) {
				if (!CommandLimits.CHAT_INPUT_NAME_PATTERN.test(config.name.toLowerCase())) {
					return null
				}
				// Validate description
				if (!config.description || config.description.length < CommandLimits.MIN_DESCRIPTION_LENGTH || config.description.length > CommandLimits.MAX_DESCRIPTION_LENGTH) {
					return null
				}
			}

			// Validate options count
			if (config.options && config.options.length > CommandLimits.MAX_OPTIONS) {
				return null
			}
		}

		// Delete all existing commands in this scope
		for (const command of this.commands.values()) {
			if (command.guild_id === guildId) {
				this.commands.delete(command.id)
			}
		}

		// Create all new commands
		const createdCommands: MockApplicationCommand[] = []
		for (const config of configs) {
			const type = config.type ?? ApplicationCommandType.ChatInput
			const command: MockApplicationCommand = {
				id: config.id ?? generateSnowflake(),
				type,
				application_id: this.applicationId,
				guild_id: guildId,
				name: type === ApplicationCommandType.ChatInput ? config.name.toLowerCase() : config.name,
				name_localizations: config.name_localizations ?? null,
				description: config.description ?? '',
				description_localizations: config.description_localizations ?? null,
				options: config.options,
				default_member_permissions: config.default_member_permissions ?? null,
				dm_permission: config.dm_permission,
				nsfw: config.nsfw,
				integration_types: config.integration_types,
				contexts: config.contexts,
				version: generateSnowflake()
			}

			this.commands.set(command.id, command)
			createdCommands.push(command)
		}

		return createdCommands
	}

	// ============================================================================
	// Invite Operations (Phase 5A)
	// ============================================================================

	/**
	 * Get an invite by code
	 */
	getInvite(code: string): MockInvite | undefined {
		return this.invites.get(code)
	}

	/**
	 * Get all invites for a guild
	 */
	getGuildInvites(guildId: Snowflake): MockInvite[] {
		return Array.from(this.invites.values()).filter((i) => i.guildId === guildId)
	}

	/**
	 * Get all invites for a channel
	 */
	getChannelInvites(channelId: Snowflake): MockInvite[] {
		return Array.from(this.invites.values()).filter((i) => i.channelId === channelId)
	}

	/**
	 * Create an invite for a channel
	 * @returns The created invite, or null if channel doesn't exist
	 */
	createInvite(guildId: Snowflake, channelId: Snowflake, config: MockInviteConfig = {}, inviterId: Snowflake): MockInvite | null {
		// Validate channel exists
		const channel = this.channels.get(channelId)
		if (!channel || channel.guildId !== guildId) {
			return null
		}

		// Generate unique code
		let code = generateInviteCode()
		while (this.invites.has(code)) {
			code = generateInviteCode()
		}

		const now = new Date()
		const maxAge = config.maxAge ?? InviteLimits.DEFAULT_MAX_AGE
		const expiresAt = maxAge === 0 ? null : new Date(now.getTime() + maxAge * 1000).toISOString()

		const invite: MockInvite = {
			code,
			guildId,
			channelId,
			inviterId,
			maxAge,
			maxUses: config.maxUses ?? 0,
			uses: 0,
			temporary: config.temporary ?? false,
			createdAt: now.toISOString(),
			expiresAt,
			targetType: config.targetType,
			targetUserId: config.targetUserId,
			targetApplicationId: config.targetApplicationId
		}

		this.invites.set(code, invite)
		return invite
	}

	/**
	 * Delete an invite by code
	 * @returns The deleted invite, or null if not found
	 */
	deleteInvite(code: string): MockInvite | null {
		const invite = this.invites.get(code)
		if (!invite) {
			return null
		}
		this.invites.delete(code)
		return invite
	}

	/**
	 * Increment invite use count (when someone joins via invite)
	 * @returns true if invite is still valid, false if expired/maxed out
	 */
	useInvite(code: string): boolean {
		const invite = this.invites.get(code)
		if (!invite) {
			return false
		}

		// Check expiration
		if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
			this.invites.delete(code)
			return false
		}

		invite.uses++

		// Check max uses
		if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
			this.invites.delete(code)
		}

		return true
	}

	// ============================================================================
	// Scheduled Event Operations (Phase 5B)
	// ============================================================================

	/**
	 * Get a scheduled event by ID
	 */
	getScheduledEvent(guildId: Snowflake, eventId: Snowflake): MockScheduledEvent | undefined {
		return this.scheduledEvents.get(`${guildId}:${eventId}`)
	}

	/**
	 * Get all scheduled events for a guild
	 */
	getGuildScheduledEvents(guildId: Snowflake): MockScheduledEvent[] {
		return Array.from(this.scheduledEvents.values()).filter((e) => e.guildId === guildId)
	}

	/**
	 * Create a scheduled event
	 * @returns The created event, or null if validation fails
	 */
	createScheduledEvent(guildId: Snowflake, config: MockScheduledEventConfig, creatorId: Snowflake): MockScheduledEvent | null {
		// Validate guild exists
		const guild = this.guilds.get(guildId)
		if (!guild) {
			return null
		}

		// Validate name
		if (!config.name || config.name.length < ScheduledEventLimits.MIN_NAME_LENGTH || config.name.length > ScheduledEventLimits.MAX_NAME_LENGTH) {
			return null
		}

		// Validate description
		if (config.description && config.description.length > ScheduledEventLimits.MAX_DESCRIPTION_LENGTH) {
			return null
		}

		// Validate channel for voice/stage events
		if (config.entityType === GuildScheduledEventEntityType.Voice || config.entityType === GuildScheduledEventEntityType.StageInstance) {
			if (!config.channelId) {
				return null
			}
			const channel = this.channels.get(config.channelId)
			if (!channel || channel.guildId !== guildId) {
				return null
			}
		}

		// Validate external events need location and end time
		if (config.entityType === GuildScheduledEventEntityType.External) {
			if (!config.entityMetadata?.location || !config.scheduledEndTime) {
				return null
			}
			if (config.entityMetadata.location.length > ScheduledEventLimits.MAX_LOCATION_LENGTH) {
				return null
			}
		}

		// Check event limit
		const existingEvents = this.getGuildScheduledEvents(guildId)
		if (existingEvents.length >= ScheduledEventLimits.MAX_EVENTS_PER_GUILD) {
			return null
		}

		const eventId = generateSnowflake()
		const event: MockScheduledEvent = {
			id: eventId,
			guildId,
			channelId: config.entityType === GuildScheduledEventEntityType.External ? null : (config.channelId ?? null),
			creatorId,
			name: config.name,
			description: config.description ?? null,
			scheduledStartTime: config.scheduledStartTime,
			scheduledEndTime: config.scheduledEndTime ?? null,
			privacyLevel: config.privacyLevel,
			status: GuildScheduledEventStatus.Scheduled,
			entityType: config.entityType,
			entityId: null,
			entityMetadata: config.entityMetadata ?? null,
			image: config.image ?? null,
			subscribers: new Set()
		}

		this.scheduledEvents.set(`${guildId}:${eventId}`, event)
		return event
	}

	/**
	 * Update a scheduled event
	 * @returns The updated event, or null if not found
	 */
	updateScheduledEvent(guildId: Snowflake, eventId: Snowflake, updates: MockScheduledEventUpdateConfig): MockScheduledEvent | null {
		const event = this.scheduledEvents.get(`${guildId}:${eventId}`)
		if (!event) {
			return null
		}

		// Validate name if provided
		if (updates.name !== undefined) {
			if (updates.name.length < ScheduledEventLimits.MIN_NAME_LENGTH || updates.name.length > ScheduledEventLimits.MAX_NAME_LENGTH) {
				return null
			}
			event.name = updates.name
		}

		// Validate description if provided
		if (updates.description !== undefined) {
			if (updates.description !== null && updates.description.length > ScheduledEventLimits.MAX_DESCRIPTION_LENGTH) {
				return null
			}
			event.description = updates.description
		}

		if (updates.privacyLevel !== undefined) event.privacyLevel = updates.privacyLevel
		if (updates.scheduledStartTime !== undefined) event.scheduledStartTime = updates.scheduledStartTime
		if (updates.scheduledEndTime !== undefined) event.scheduledEndTime = updates.scheduledEndTime
		if (updates.channelId !== undefined) event.channelId = updates.channelId
		if (updates.entityType !== undefined) event.entityType = updates.entityType
		if (updates.entityMetadata !== undefined) event.entityMetadata = updates.entityMetadata
		if (updates.status !== undefined) event.status = updates.status
		if (updates.image !== undefined) event.image = updates.image

		return event
	}

	/**
	 * Delete a scheduled event
	 * @returns true if deleted, false if not found
	 */
	deleteScheduledEvent(guildId: Snowflake, eventId: Snowflake): boolean {
		return this.scheduledEvents.delete(`${guildId}:${eventId}`)
	}

	/**
	 * Add a subscriber to a scheduled event
	 * @returns true if added, false if event not found
	 */
	addScheduledEventSubscriber(guildId: Snowflake, eventId: Snowflake, userId: Snowflake): boolean {
		const event = this.scheduledEvents.get(`${guildId}:${eventId}`)
		if (!event) {
			return false
		}
		event.subscribers.add(userId)
		return true
	}

	/**
	 * Remove a subscriber from a scheduled event
	 * @returns true if removed, false if event not found or user wasn't subscribed
	 */
	removeScheduledEventSubscriber(guildId: Snowflake, eventId: Snowflake, userId: Snowflake): boolean {
		const event = this.scheduledEvents.get(`${guildId}:${eventId}`)
		if (!event) {
			return false
		}
		return event.subscribers.delete(userId)
	}

	/**
	 * Get subscribers for a scheduled event
	 */
	getScheduledEventSubscribers(guildId: Snowflake, eventId: Snowflake, options?: { limit?: number; withMember?: boolean; before?: Snowflake; after?: Snowflake }): Array<{ user: MockUser; member?: MockGuildMember }> {
		const event = this.scheduledEvents.get(`${guildId}:${eventId}`)
		if (!event) {
			return []
		}

		let userIds = Array.from(event.subscribers)

		// Apply pagination
		if (options?.after) {
			const afterIndex = userIds.indexOf(options.after)
			if (afterIndex !== -1) {
				userIds = userIds.slice(afterIndex + 1)
			}
		}
		if (options?.before) {
			const beforeIndex = userIds.indexOf(options.before)
			if (beforeIndex !== -1) {
				userIds = userIds.slice(0, beforeIndex)
			}
		}
		if (options?.limit) {
			userIds = userIds.slice(0, options.limit)
		}

		return userIds.map((userId) => {
			const user = this.users.get(userId)
			const result: { user: MockUser; member?: MockGuildMember } = {
				user: user ?? { id: userId, username: 'Unknown', discriminator: '0', globalName: null, avatar: null, bot: false }
			}
			if (options?.withMember) {
				const member = this.guildMembers.get(`${guildId}:${userId}`)
				if (member) {
					result.member = member
				}
			}
			return result
		})
	}

	// ============================================================================
	// Auto-Moderation Rule Operations (Phase 5C)
	// ============================================================================

	/**
	 * Get an auto-mod rule by ID
	 */
	getAutoModRule(guildId: Snowflake, ruleId: Snowflake): MockAutoModRule | undefined {
		return this.autoModRules.get(`${guildId}:${ruleId}`)
	}

	/**
	 * Get all auto-mod rules for a guild
	 */
	getGuildAutoModRules(guildId: Snowflake): MockAutoModRule[] {
		return Array.from(this.autoModRules.values()).filter((r) => r.guildId === guildId)
	}

	/**
	 * Create an auto-mod rule
	 * @returns The created rule, or null if validation fails
	 */
	createAutoModRule(guildId: Snowflake, config: MockAutoModRuleConfig, creatorId: Snowflake): MockAutoModRule | null {
		// Validate guild exists
		const guild = this.guilds.get(guildId)
		if (!guild) {
			return null
		}

		// Validate name
		if (!config.name || config.name.length < AutoModLimits.MIN_NAME_LENGTH || config.name.length > AutoModLimits.MAX_NAME_LENGTH) {
			return null
		}

		// Validate at least one action
		if (!config.actions || config.actions.length === 0) {
			return null
		}

		// Check rule limit per trigger type
		const existingRules = this.getGuildAutoModRules(guildId).filter((r) => r.triggerType === config.triggerType)
		if (existingRules.length >= AutoModLimits.MAX_RULES_PER_TRIGGER_TYPE) {
			return null
		}

		// Validate exempt roles/channels limits
		if (config.exemptRoles && config.exemptRoles.length > AutoModLimits.MAX_EXEMPT_ROLES) {
			return null
		}
		if (config.exemptChannels && config.exemptChannels.length > AutoModLimits.MAX_EXEMPT_CHANNELS) {
			return null
		}

		const ruleId = generateSnowflake()
		const rule: MockAutoModRule = {
			id: ruleId,
			guildId,
			name: config.name,
			creatorId,
			eventType: config.eventType,
			triggerType: config.triggerType,
			triggerMetadata: config.triggerMetadata ?? {},
			actions: config.actions,
			enabled: config.enabled ?? false,
			exemptRoles: config.exemptRoles ?? [],
			exemptChannels: config.exemptChannels ?? []
		}

		this.autoModRules.set(`${guildId}:${ruleId}`, rule)
		return rule
	}

	/**
	 * Update an auto-mod rule
	 * @returns The updated rule, or null if not found
	 */
	updateAutoModRule(guildId: Snowflake, ruleId: Snowflake, updates: MockAutoModRuleUpdateConfig): MockAutoModRule | null {
		const rule = this.autoModRules.get(`${guildId}:${ruleId}`)
		if (!rule) {
			return null
		}

		// Validate name if provided
		if (updates.name !== undefined) {
			if (updates.name.length < AutoModLimits.MIN_NAME_LENGTH || updates.name.length > AutoModLimits.MAX_NAME_LENGTH) {
				return null
			}
			rule.name = updates.name
		}

		// Validate exempt roles/channels limits
		if (updates.exemptRoles !== undefined && updates.exemptRoles.length > AutoModLimits.MAX_EXEMPT_ROLES) {
			return null
		}
		if (updates.exemptChannels !== undefined && updates.exemptChannels.length > AutoModLimits.MAX_EXEMPT_CHANNELS) {
			return null
		}

		if (updates.eventType !== undefined) rule.eventType = updates.eventType
		if (updates.triggerMetadata !== undefined) rule.triggerMetadata = updates.triggerMetadata
		if (updates.actions !== undefined) rule.actions = updates.actions
		if (updates.enabled !== undefined) rule.enabled = updates.enabled
		if (updates.exemptRoles !== undefined) rule.exemptRoles = updates.exemptRoles
		if (updates.exemptChannels !== undefined) rule.exemptChannels = updates.exemptChannels

		return rule
	}

	/**
	 * Delete an auto-mod rule
	 * @returns The deleted rule, or null if not found
	 */
	deleteAutoModRule(guildId: Snowflake, ruleId: Snowflake): MockAutoModRule | null {
		const key = `${guildId}:${ruleId}`
		const rule = this.autoModRules.get(key)
		if (!rule) {
			return null
		}
		this.autoModRules.delete(key)
		return rule
	}

	// ============================================================================
	// Phase 11: Stage Instance Operations
	// ============================================================================

	/**
	 * Get a stage instance by channel ID
	 */
	getStageInstance(channelId: Snowflake): MockStageInstance | undefined {
		return this.stageInstances.get(channelId)
	}

	/**
	 * Get all stage instances for a guild
	 */
	getGuildStageInstances(guildId: Snowflake): MockStageInstance[] {
		return Array.from(this.stageInstances.values()).filter((s) => s.guildId === guildId)
	}

	/**
	 * Create a stage instance
	 * @returns The created stage instance, or null if validation fails
	 */
	createStageInstance(guildId: Snowflake, config: MockStageInstanceConfig): MockStageInstance | null {
		// Validate channel exists and is a stage channel
		const channel = this.channels.get(config.channelId)
		if (!channel || channel.type !== 13) {
			// 13 = GUILD_STAGE_VOICE
			return null
		}

		// Check if stage instance already exists for this channel
		if (this.stageInstances.has(config.channelId)) {
			return null
		}

		// Validate topic length (1-120 characters)
		if (!config.topic || config.topic.length < 1 || config.topic.length > 120) {
			return null
		}

		const stageInstance: MockStageInstance = {
			id: generateSnowflake(),
			guildId,
			channelId: config.channelId,
			topic: config.topic,
			privacyLevel: config.privacyLevel ?? StageInstancePrivacyLevel.GuildOnly,
			discoverableDisabled: true, // Always true for guild-only
			guildScheduledEventId: config.guildScheduledEventId ?? null
		}

		this.stageInstances.set(config.channelId, stageInstance)
		return stageInstance
	}

	/**
	 * Update a stage instance
	 * @returns The updated stage instance, or null if not found
	 */
	updateStageInstance(
		channelId: Snowflake,
		updates: { topic?: string; privacyLevel?: StageInstancePrivacyLevel }
	): MockStageInstance | null {
		const stageInstance = this.stageInstances.get(channelId)
		if (!stageInstance) {
			return null
		}

		// Validate topic if provided
		if (updates.topic !== undefined) {
			if (updates.topic.length < 1 || updates.topic.length > 120) {
				return null
			}
			stageInstance.topic = updates.topic
		}

		if (updates.privacyLevel !== undefined) {
			stageInstance.privacyLevel = updates.privacyLevel
			stageInstance.discoverableDisabled = updates.privacyLevel === StageInstancePrivacyLevel.GuildOnly
		}

		return stageInstance
	}

	/**
	 * Delete a stage instance
	 * @returns The deleted stage instance, or null if not found
	 */
	deleteStageInstance(channelId: Snowflake): MockStageInstance | null {
		const stageInstance = this.stageInstances.get(channelId)
		if (!stageInstance) {
			return null
		}
		this.stageInstances.delete(channelId)
		return stageInstance
	}

	// ============================================================================
	// Phase 14: Audit Log Operations
	// ============================================================================

	/**
	 * Create an audit log entry for a guild
	 * @param guildId The guild ID
	 * @param config The audit log entry configuration
	 * @returns The created audit log entry
	 */
	createAuditLogEntry(guildId: Snowflake, config: MockAuditLogEntryConfig): MockAuditLogEntry {
		const entry: MockAuditLogEntry = {
			id: generateSnowflake(),
			target_id: config.targetId ?? null,
			user_id: config.userId ?? this.botUser.id,
			action_type: config.actionType,
			changes: config.changes,
			options: config.options,
			reason: config.reason,
			guild_id: guildId,
			created_at: new Date().toISOString()
		}

		// Get or create the guild's audit log array
		let entries = this.auditLogs.get(guildId)
		if (!entries) {
			entries = []
			this.auditLogs.set(guildId, entries)
		}

		// Add entry at the beginning (newest first)
		entries.unshift(entry)

		// Enforce limit with LRU eviction
		if (entries.length > AuditLogLimits.MAX_ENTRIES_PER_GUILD) {
			entries.pop()
		}

		return entry
	}

	/**
	 * Get audit log entries for a guild with optional filtering
	 * @param guildId The guild ID
	 * @param options Filtering options
	 * @returns Array of audit log entries
	 */
	getAuditLogEntries(
		guildId: Snowflake,
		options?: {
			userId?: Snowflake
			actionType?: AuditLogEvent
			before?: Snowflake
			limit?: number
		}
	): MockAuditLogEntry[] {
		const entries = this.auditLogs.get(guildId) ?? []
		let filtered = [...entries]

		// Filter by user
		if (options?.userId) {
			filtered = filtered.filter((e) => e.user_id === options.userId)
		}

		// Filter by action type
		if (options?.actionType !== undefined) {
			filtered = filtered.filter((e) => e.action_type === options.actionType)
		}

		// Filter by before ID (entries are sorted newest first, so we skip entries >= before)
		if (options?.before) {
			const beforeIndex = filtered.findIndex((e) => e.id === options.before)
			if (beforeIndex !== -1) {
				filtered = filtered.slice(beforeIndex + 1)
			}
		}

		// Apply limit
		const limit = Math.min(options?.limit ?? AuditLogLimits.DEFAULT_FETCH_LIMIT, AuditLogLimits.MAX_FETCH_LIMIT)
		return filtered.slice(0, limit)
	}

	// ============================================================================
	// State Management
	// ============================================================================

	/**
	 * Reset state to initial values (keeps bot user)
	 */
	reset(): void {
		this.guilds.clear()
		this.channels.clear()
		this.dmChannels.clear()
		this.messages.clear()
		this.interactions.clear()
		this.threadMembers.clear()
		this.pollVotes.clear()
		this.stickers.clear()
		this.webhooks.clear()
		this.emojis.clear()
		this.roles.clear()
		this.guildMembers.clear()
		this.bans.clear()
		this.commands.clear()
		this.invites.clear()
		this.scheduledEvents.clear()
		this.autoModRules.clear()
		this.stageInstances.clear()
		this.auditLogs.clear()
		this.interactionsByToken.clear()
		this.webhooksByToken.clear()
		this.users.clear()

		// Re-add bot user
		this.users.set(this.botUser.id, this.botUser)

		// Reset sequence
		this._sequence = 0
	}

	/**
	 * Serialize state for API responses
	 */
	serialize(): SerializedSessionState {
		return {
			guilds: Array.from(this.guilds.values()).map(serializeMockGuild),
			channels: Array.from(this.channels.values()).map(serializeMockChannel),
			dmChannels: Array.from(this.dmChannels.values()).map(serializeMockChannel),
			users: Array.from(this.users.values()).map(serializeMockUser),
			messages: Array.from(this.messages.values()).map(serializeMockMessage),
			interactions: Array.from(this.interactions.values()).map(serializeMockInteraction),
			attachments: Array.from(this.attachments.values()).map(serializeStoredAttachment),
			webhooks: Array.from(this.webhooks.values()).map(serializeMockWebhook),
			botUser: serializeMockUser(this.botUser),
			applicationId: this.applicationId,
			sequence: this._sequence
		}
	}
}

// ============================================================================
// Factory Functions (for creating entities)
// ============================================================================

/**
 * Create an empty session state
 */
export function createSessionState(options?: StateOptions): MockServerState {
	return new MockServerState(options)
}

/**
 * Create a mock user from config
 */
export function createMockUser(config?: MockUserConfig): MockUser {
	return {
		id: config?.id ?? generateSnowflake(),
		username: config?.username ?? 'User',
		discriminator: config?.discriminator ?? '0',
		globalName: config?.globalName ?? config?.username ?? 'User',
		avatar: config?.avatar ?? null,
		bot: config?.bot ?? false,
		status: config?.status,
		activities: config?.activities
	}
}

/**
 * Create a mock guild from config
 */
export function createMockGuild(config?: { id?: Snowflake; name?: string; ownerId?: Snowflake }): MockGuild {
	const id = config?.id ?? generateSnowflake()
	return {
		id,
		name: config?.name ?? 'Test Guild',
		ownerId: config?.ownerId ?? generateSnowflake(),
		channels: [],
		members: [],
		roles: [id], // @everyone role has same ID as guild
		stickers: [], // Phase 4I
		emojis: [] // Phase 4K
	}
}

/**
 * Create a mock channel from config
 */
export function createMockChannel(config?: {
	id?: Snowflake
	guildId?: Snowflake
	name?: string
	type?: number
	parentId?: Snowflake | null
	topic?: string | null
	position?: number
	recipientIds?: Snowflake[]
}): MockChannel {
	return {
		id: config?.id ?? generateSnowflake(),
		guildId: config?.guildId,
		name: config?.name ?? 'general',
		type: config?.type ?? 0, // GUILD_TEXT
		parentId: config?.parentId ?? null,
		topic: config?.topic ?? null,
		position: config?.position,
		recipientIds: config?.recipientIds
	}
}

/**
 * Create a mock thread from config
 */
export function createMockThread(config: MockThreadConfig): MockThread {
	const now = new Date().toISOString()
	return {
		id: config.id ?? generateSnowflake(),
		guildId: undefined, // Will be set when added to state
		name: config.name,
		type: config.type,
		parentId: config.parentId,
		ownerId: config.ownerId ?? generateSnowflake(),
		threadMetadata: {
			archived: false,
			auto_archive_duration: config.autoArchiveDuration ?? 1440, // 24 hours default
			archive_timestamp: now,
			locked: false,
			invitable: config.type === 12 ? (config.invitable ?? true) : undefined,
			create_timestamp: now,
			last_activity_timestamp: now // Track for auto-archive
		},
		memberCount: 1, // Owner is always a member
		messageCount: 0,
		totalMessageSent: 0,
		lastMessageId: null,
		rateLimitPerUser: config.rateLimitPerUser ?? 0
	}
}

/**
 * Create a mock forum/media channel from config (Phase 4H)
 */
export function createMockForumChannel(config?: MockForumChannelConfig): MockForumChannel {
	const type = config?.type ?? 15 // Default to GUILD_FORUM

	// Generate IDs for available_tags if provided without IDs
	const availableTags: MockForumTag[] = (config?.available_tags ?? []).map((tag) => ({
		id: generateSnowflake(),
		name: tag.name,
		moderated: tag.moderated,
		emoji_id: tag.emoji_id,
		emoji_name: tag.emoji_name
	}))

	return {
		id: config?.id ?? generateSnowflake(),
		guildId: config?.guildId,
		name: config?.name ?? (type === 15 ? 'forum' : 'media'),
		type,
		parentId: config?.parentId ?? null,
		topic: config?.topic,
		default_auto_archive_duration: config?.default_auto_archive_duration ?? 1440,
		default_thread_rate_limit_per_user: config?.default_thread_rate_limit_per_user,
		default_sort_order: config?.default_sort_order ?? ForumSortOrderType.LatestActivity,
		default_forum_layout: config?.default_forum_layout ?? ForumLayoutType.NotSet,
		default_reaction_emoji: config?.default_reaction_emoji ?? null,
		available_tags: availableTags,
		template: config?.template
	}
}

/**
 * Create a mock message from config
 */
export function createMockMessage(config: MockMessageConfig): MockMessage {
	const content = config.content ?? ''

	// Auto-parse mentions from content if not explicitly provided
	const parsed = MentionParser.parse(content)

	const message: MockMessage = {
		id: config.id ?? generateSnowflake(),
		channelId: config.channelId,
		guildId: config.guildId,
		authorId: config.authorId,
		content,
		timestamp: new Date().toISOString(),
		editedTimestamp: null,
		tts: config.tts ?? false,
		mentionEveryone: parsed.everyone || parsed.here,
		mentions: config.mentions ?? parsed.users,
		mentionRoles: parsed.roles,
		attachments: config.attachments ?? [],
		embeds: config.embeds ?? [],
		pinned: false,
		type: config.type ?? 0, // DEFAULT
		nonce: config.nonce ?? null
	}

	// Phase 3I: Add optional fields if provided
	if (config.call) {
		message.call = config.call
	}
	if (config.interactionMetadata) {
		message.interaction_metadata = config.interactionMetadata
		// Also populate deprecated field for backwards compatibility
		message.interaction = {
			id: config.interactionMetadata.id,
			type: config.interactionMetadata.type,
			name: config.interactionName ?? '',
			user: config.interactionMetadata.user
		}
	}
	if (config.messageSnapshots) {
		message.message_snapshots = config.messageSnapshots
	}
	if (config.resolved) {
		message.resolved = config.resolved
	}

	// Phase 4F: Components V2
	if (config.flags !== undefined) {
		message.flags = config.flags
	}
	if (config.components) {
		message.components = config.components
	}

	// Phase 4G: Polls
	if (config.poll) {
		message.poll = createMockPoll(config.poll)
	}

	// Phase 3: Message reference (for replies)
	if (config.message_reference) {
		message.message_reference = config.message_reference
	}

	// Phase 20: Position and roleSubscriptionData
	if (config.position !== undefined) {
		message.position = config.position
	}
	if (config.roleSubscriptionData) {
		message.roleSubscriptionData = config.roleSubscriptionData
	}

	return message
}

/** Maximum number of answers in a poll */
export const MAX_POLL_ANSWERS = 10

/** Maximum character length for poll question text */
export const MAX_POLL_QUESTION_LENGTH = 300

/** Maximum character length for poll answer text */
export const MAX_POLL_ANSWER_LENGTH = 55

/**
 * Create a mock poll from config
 */
export function createMockPoll(config: MockPollConfig): MockPoll {
	// Validate max answers (Discord limit is 10)
	if (config.answers.length > MAX_POLL_ANSWERS) {
		throw new Error(`Poll cannot have more than ${MAX_POLL_ANSWERS} answers`)
	}
	if (config.answers.length < 1) {
		throw new Error('Poll must have at least 1 answer')
	}

	// Validate question text length
	if (config.question.text && config.question.text.length > MAX_POLL_QUESTION_LENGTH) {
		throw new Error(`Poll question text cannot exceed ${MAX_POLL_QUESTION_LENGTH} characters`)
	}

	// Validate answer text lengths
	for (let i = 0; i < config.answers.length; i++) {
		const answerText = config.answers[i].poll_media.text
		if (answerText && answerText.length > MAX_POLL_ANSWER_LENGTH) {
			throw new Error(`Poll answer ${i + 1} text cannot exceed ${MAX_POLL_ANSWER_LENGTH} characters`)
		}
	}

	// Calculate expiry timestamp from duration (in hours)
	let expiry: string | null = null
	if (config.duration && config.duration > 0) {
		const expiryDate = new Date()
		expiryDate.setHours(expiryDate.getHours() + config.duration)
		expiry = expiryDate.toISOString()
	}

	// Generate answer_ids (1-indexed)
	const answers: MockPollAnswer[] = config.answers.map((answer, index) => ({
		answer_id: index + 1,
		poll_media: answer.poll_media
	}))

	// Initialize empty results
	const results: MockPollResults = {
		is_finalized: false,
		answer_counts: answers.map((a) => ({
			id: a.answer_id,
			count: 0,
			me_voted: false
		}))
	}

	return {
		question: config.question,
		answers,
		expiry,
		allow_multiselect: config.allow_multiselect ?? false,
		layout_type: config.layout_type ?? PollLayoutType.Default,
		results
	}
}

// ============================================================================
// Helper Functions (backward compatibility)
// ============================================================================

/**
 * Add a guild to the session state
 * @deprecated Use state.addGuild() instead
 */
export function addGuildToSession(state: SessionState, guild: MockGuild): void {
	state.guilds.set(guild.id, guild)

	// Add bot user as member if not already
	if (!guild.members.includes(state.botUser.id)) {
		guild.members.push(state.botUser.id)
	}
}

/**
 * Add a channel to a guild in the session state
 * @deprecated Use state.addChannelToGuild() instead
 */
export function addChannelToGuild(state: SessionState, guildId: Snowflake, channel: MockChannel): void {
	// Set guild ID on channel
	channel.guildId = guildId

	// Add channel to state
	state.channels.set(channel.id, channel)

	// Add channel ID to guild's channel list
	const guild = state.guilds.get(guildId)
	if (guild && !guild.channels.includes(channel.id)) {
		guild.channels.push(channel.id)
	}
}

/**
 * Create a default guild with a general channel and add it to the session state
 * Returns the created guild for reference
 */
export function createDefaultGuildWithChannel(
	state: SessionState,
	config?: { guildName?: string; channelName?: string }
): MockGuild {
	// Create the guild
	const guild = createMockGuild({
		name: config?.guildName ?? 'Test Guild',
		ownerId: state.botUser.id
	})

	// Create a general text channel
	const channel = createMockChannel({
		guildId: guild.id,
		name: config?.channelName ?? 'general',
		type: 0 // GUILD_TEXT
	})

	// Add channel to guild's channel list
	guild.channels.push(channel.id)

	// Add bot user as member
	guild.members.push(state.botUser.id)

	// Add to session state
	state.guilds.set(guild.id, guild)
	state.channels.set(channel.id, channel)

	// Create @everyone role and add bot as member (Phase 4L)
	if (state instanceof MockServerState) {
		// Create the @everyone role
		state.createEveryoneRole(guild.id)

		// Create bot member with no extra roles
		state.createGuildMember(guild.id, state.botUser.id, { roles: [] })
	} else {
		// Fallback for plain SessionState: create role directly
		const everyoneRole: MockRole = {
			id: guild.id,
			guildId: guild.id,
			name: '@everyone',
			color: 0,
			hoist: false,
			position: 0,
			permissions: '1071698660929',
			managed: false,
			mentionable: false,
			flags: 0
		}
		state.roles.set(everyoneRole.id, everyoneRole)

		// Create bot member
		const botMember: MockGuildMember = {
			userId: state.botUser.id,
			guildId: guild.id,
			roles: [],
			nick: null,
			joinedAt: new Date().toISOString(),
			premiumSince: null,
			deaf: false,
			mute: false,
			pending: false,
			communicationDisabledUntil: null,
			flags: 0
		}
		state.guildMembers.set(`${guild.id}:${state.botUser.id}`, botMember)
	}

	return guild
}

// ============================================================================
// Serialization Functions
// ============================================================================

/**
 * Serialize session state for API responses
 */
export function serializeSessionState(state: SessionState): SerializedSessionState {
	return {
		guilds: Array.from(state.guilds.values()).map(serializeMockGuild),
		channels: Array.from(state.channels.values()).map(serializeMockChannel),
		dmChannels: Array.from(state.dmChannels.values()).map(serializeMockChannel),
		users: Array.from(state.users.values()).map(serializeMockUser),
		messages: Array.from(state.messages.values()).map(serializeMockMessage),
		interactions: Array.from(state.interactions.values()).map(serializeMockInteraction),
		attachments: Array.from(state.attachments.values()).map(serializeStoredAttachment),
		webhooks: Array.from(state.webhooks.values()).map(serializeMockWebhook),
		botUser: serializeMockUser(state.botUser),
		applicationId: state.applicationId,
		sequence: state.sequence
	}
}

/**
 * Serialize a mock guild
 */
export function serializeMockGuild(guild: MockGuild): SerializedMockGuild {
	return {
		id: guild.id,
		name: guild.name,
		ownerId: guild.ownerId,
		channels: [...guild.channels],
		members: [...guild.members],
		roles: [...guild.roles]
	}
}

/**
 * Serialize a mock channel
 */
export function serializeMockChannel(channel: MockChannel): SerializedMockChannel {
	return {
		id: channel.id,
		guildId: channel.guildId,
		name: channel.name,
		type: channel.type,
		parentId: channel.parentId
	}
}

/**
 * Serialize a mock thread
 */
export function serializeMockThread(thread: MockThread): SerializedMockThread {
	return {
		id: thread.id,
		guildId: thread.guildId,
		name: thread.name,
		type: thread.type,
		parentId: thread.parentId,
		ownerId: thread.ownerId,
		threadMetadata: {
			archived: thread.threadMetadata.archived,
			auto_archive_duration: thread.threadMetadata.auto_archive_duration,
			archive_timestamp: thread.threadMetadata.archive_timestamp,
			locked: thread.threadMetadata.locked,
			invitable: thread.threadMetadata.invitable,
			create_timestamp: thread.threadMetadata.create_timestamp,
			last_activity_timestamp: thread.threadMetadata.last_activity_timestamp
		},
		memberCount: thread.memberCount,
		messageCount: thread.messageCount,
		totalMessageSent: thread.totalMessageSent,
		lastMessageId: thread.lastMessageId
	}
}

/**
 * Serialize a mock user
 */
export function serializeMockUser(user: MockUser): SerializedMockUser {
	return {
		id: user.id,
		username: user.username,
		discriminator: user.discriminator,
		globalName: user.globalName,
		avatar: user.avatar,
		bot: user.bot
	}
}

/**
 * Serialize a mock message
 */
export function serializeMockMessage(message: MockMessage): SerializedMockMessage {
	return {
		id: message.id,
		channelId: message.channelId,
		guildId: message.guildId,
		authorId: message.authorId,
		content: message.content,
		timestamp: message.timestamp,
		editedTimestamp: message.editedTimestamp,
		tts: message.tts,
		mentionEveryone: message.mentionEveryone,
		mentions: [...message.mentions],
		mentionRoles: [...message.mentionRoles],
		attachments: message.attachments.map(serializeMockAttachment),
		embeds: [...message.embeds],
		pinned: message.pinned,
		type: message.type
	}
}

/**
 * Serialize a mock interaction
 */
export function serializeMockInteraction(interaction: MockInteraction): SerializedMockInteraction {
	return {
		id: interaction.id,
		applicationId: interaction.applicationId,
		type: interaction.type,
		token: interaction.token,
		channelId: interaction.channelId,
		guildId: interaction.guildId,
		userId: interaction.userId,
		commandName: interaction.commandName,
		commandId: interaction.commandId,
		options: interaction.options,
		createdAt: interaction.createdAt,
		expiresAt: interaction.expiresAt,
		// Response tracking (Phase 3B)
		response: interaction.response,
		respondedAt: interaction.respondedAt,
		// MESSAGE_COMPONENT interactions (Phase 3C, 3D)
		customId: interaction.customId,
		componentType: interaction.componentType,
		messageId: interaction.messageId,
		values: interaction.values,
		// MODAL_SUBMIT interactions (Phase 3E)
		modalFields: interaction.modalFields,
		// Context menu commands (Phase 3G)
		targetId: interaction.targetId,
		contextMenuType: interaction.contextMenuType
	}
}

/**
 * Serialize a mock attachment (API format)
 */
export function serializeMockAttachment(attachment: MockAttachment): SerializedMockAttachment {
	return {
		id: attachment.id,
		filename: attachment.filename,
		title: attachment.title,
		description: attachment.description,
		content_type: attachment.content_type,
		size: attachment.size,
		url: attachment.url,
		proxy_url: attachment.proxy_url,
		width: attachment.width,
		height: attachment.height,
		duration_secs: attachment.duration_secs,
		waveform: attachment.waveform,
		ephemeral: attachment.ephemeral,
		flags: attachment.flags
	}
}

/**
 * Serialize a stored attachment (includes binary data as base64)
 */
export function serializeStoredAttachment(attachment: StoredAttachment): SerializedStoredAttachment {
	// Convert Uint8Array to base64 string
	const base64 = Buffer.from(attachment.data).toString('base64')

	return {
		id: attachment.id,
		channelId: attachment.channelId,
		messageId: attachment.messageId,
		filename: attachment.filename,
		contentType: attachment.contentType,
		size: attachment.size,
		data: base64,
		width: attachment.width,
		height: attachment.height
	}
}

/**
 * Deserialize a stored attachment (converts base64 back to Uint8Array)
 */
export function deserializeStoredAttachment(serialized: SerializedStoredAttachment): StoredAttachment {
	return {
		id: serialized.id,
		channelId: serialized.channelId,
		messageId: serialized.messageId,
		filename: serialized.filename,
		contentType: serialized.contentType,
		size: serialized.size,
		data: new Uint8Array(Buffer.from(serialized.data, 'base64')),
		width: serialized.width,
		height: serialized.height
	}
}

/**
 * Serialize a mock webhook (Phase 4J)
 */
export function serializeMockWebhook(webhook: MockWebhook): SerializedMockWebhook {
	return {
		id: webhook.id,
		type: webhook.type,
		guild_id: webhook.guild_id,
		channel_id: webhook.channel_id,
		user: webhook.user ? serializeMockUser(webhook.user) : undefined,
		name: webhook.name,
		avatar: webhook.avatar,
		token: webhook.token,
		application_id: webhook.application_id,
		source_guild: webhook.source_guild,
		source_channel: webhook.source_channel
	}
}

/**
 * Serialize a mock role (Phase 4L)
 */
export function serializeMockRole(role: MockRole): SerializedMockRole {
	return {
		id: role.id,
		guildId: role.guildId,
		name: role.name,
		color: role.color,
		hoist: role.hoist,
		icon: role.icon,
		unicode_emoji: role.unicodeEmoji,
		position: role.position,
		permissions: role.permissions,
		managed: role.managed,
		mentionable: role.mentionable,
		tags: role.tags
			? {
					bot_id: role.tags.bot_id,
					integration_id: role.tags.integration_id,
					premium_subscriber: role.tags.premium_subscriber,
					subscription_listing_id: role.tags.subscription_listing_id,
					available_for_purchase: role.tags.available_for_purchase,
					guild_connections: role.tags.guild_connections
				}
			: undefined,
		flags: role.flags
	}
}

/**
 * Serialize a mock guild member (Phase 4L)
 */
export function serializeMockGuildMember(member: MockGuildMember, user: MockUser): SerializedMockGuildMember {
	return {
		user: serializeMockUser(user),
		nick: member.nick,
		avatar: member.avatar,
		roles: [...member.roles],
		joined_at: member.joinedAt,
		premium_since: member.premiumSince,
		deaf: member.deaf,
		mute: member.mute,
		pending: member.pending,
		communication_disabled_until: member.communicationDisabledUntil,
		flags: member.flags
	}
}

/**
 * Create a mock role from config (Phase 4L)
 */
export function createMockRole(guildId: Snowflake, config?: MockRoleConfig): MockRole {
	return {
		id: config?.id ?? generateSnowflake(),
		guildId,
		name: config?.name ?? 'new role',
		color: config?.color ?? 0,
		hoist: config?.hoist ?? false,
		icon: config?.icon ?? null,
		unicodeEmoji: config?.unicodeEmoji ?? null,
		position: config?.position ?? 1,
		permissions: config?.permissions ?? '0',
		managed: config?.managed ?? false,
		mentionable: config?.mentionable ?? false,
		tags: config?.tags,
		flags: 0
	}
}

/**
 * Create a mock guild member from config (Phase 4L)
 */
export function createMockGuildMember(guildId: Snowflake, userId: Snowflake, config?: MockGuildMemberConfig): MockGuildMember {
	return {
		userId,
		guildId,
		roles: config?.roles ?? [],
		nick: config?.nick ?? null,
		joinedAt: new Date().toISOString(),
		premiumSince: null,
		deaf: config?.deaf ?? false,
		mute: config?.mute ?? false,
		pending: false,
		communicationDisabledUntil: config?.communicationDisabledUntil ?? null,
		flags: 0
	}
}

// ============================================================================
// Phase 4F: Components V2 Validation
// ============================================================================

/**
 * Validate Components V2 structure according to Discord's rules:
 * - Max 40 total components (including nested)
 * - Max 4000 chars total across all TextDisplay components
 * - Component IDs must be unique
 * - attachment:// URLs must reference valid attachments
 * - TextDisplay: content is required
 * - Section: 1-3 TextDisplay components required
 * - MediaGallery: 1-10 items, description max 1024 chars
 * - Thumbnail: description max 1024 chars
 * - File: requires file field with attachment:// URL
 *
 * @param components - Array of V2 components to validate
 * @param attachmentFilenames - Set of valid attachment filenames for attachment:// URLs
 * @returns Validation result with any errors
 */
export function validateComponentsV2(
	components: unknown[],
	attachmentFilenames?: Set<string>
): ComponentsV2ValidationResult {
	const errors: string[] = []
	let totalComponents = 0
	let totalTextLength = 0
	const usedIds = new Set<number>()

	function validateComponent(comp: Record<string, unknown>, depth = 0): void {
		// Prevent excessive nesting
		if (depth > 10) {
			errors.push('Component nesting too deep (max 10 levels)')
			return
		}

		totalComponents++

		// Check component count limit
		if (totalComponents > ComponentsV2Limits.MAX_COMPONENTS) {
			// Only add error once
			if (totalComponents === ComponentsV2Limits.MAX_COMPONENTS + 1) {
				errors.push(`Too many components (max ${ComponentsV2Limits.MAX_COMPONENTS})`)
			}
			return
		}

		// Check ID uniqueness
		if (comp.id !== undefined) {
			if (typeof comp.id === 'number') {
				if (usedIds.has(comp.id)) {
					errors.push(`Duplicate component ID: ${comp.id}`)
				}
				usedIds.add(comp.id)
			}
		}

		const compType = comp.type as number

		// TextDisplay validation (type 10)
		if (compType === ComponentTypeV2.TextDisplay) {
			// Content is required for TextDisplay
			if (typeof comp.content !== 'string' || comp.content.length === 0) {
				errors.push('TextDisplay component requires content')
			} else {
				totalTextLength += comp.content.length
				if (totalTextLength > ComponentsV2Limits.MAX_TEXT_LENGTH) {
					// Only add error once when we exceed
					if (
						totalTextLength - comp.content.length <= ComponentsV2Limits.MAX_TEXT_LENGTH &&
						totalTextLength > ComponentsV2Limits.MAX_TEXT_LENGTH
					) {
						errors.push(`Total text length exceeds ${ComponentsV2Limits.MAX_TEXT_LENGTH} chars`)
					}
				}
			}
		}

		// Section validation (type 9)
		if (compType === ComponentTypeV2.Section) {
			if (!Array.isArray(comp.components) || comp.components.length < ComponentsV2Limits.MIN_SECTION_TEXT_COMPONENTS) {
				errors.push(
					`Section requires at least ${ComponentsV2Limits.MIN_SECTION_TEXT_COMPONENTS} TextDisplay component`
				)
			} else if (comp.components.length > ComponentsV2Limits.MAX_SECTION_TEXT_COMPONENTS) {
				errors.push(
					`Section has too many text components: ${comp.components.length} (max ${ComponentsV2Limits.MAX_SECTION_TEXT_COMPONENTS})`
				)
			}
			// Validate nested components
			if (Array.isArray(comp.components)) {
				for (const nested of comp.components) {
					if (nested && typeof nested === 'object') {
						validateComponent(nested as Record<string, unknown>, depth + 1)
					}
				}
			}
			// Validate accessory
			if (comp.accessory && typeof comp.accessory === 'object') {
				validateComponent(comp.accessory as Record<string, unknown>, depth + 1)
			}
		}

		// MediaGallery validation (type 12)
		if (compType === ComponentTypeV2.MediaGallery) {
			if (Array.isArray(comp.items)) {
				if (comp.items.length === 0) {
					errors.push('MediaGallery must have at least 1 item')
				} else if (comp.items.length > ComponentsV2Limits.MAX_MEDIA_GALLERY_ITEMS) {
					errors.push(
						`MediaGallery has too many items: ${comp.items.length} (max ${ComponentsV2Limits.MAX_MEDIA_GALLERY_ITEMS})`
					)
				}
				// Validate attachment:// URLs and description length in items
				for (let i = 0; i < comp.items.length; i++) {
					const item = comp.items[i]
					if (item && typeof item === 'object') {
						const galleryItem = item as { media?: { url?: string }; description?: string }
						validateAttachmentUrl(galleryItem.media?.url)
						// Validate description length
						if (
							galleryItem.description &&
							galleryItem.description.length > ComponentsV2Limits.MAX_MEDIA_DESCRIPTION_LENGTH
						) {
							errors.push(
								`MediaGallery item ${i + 1} description exceeds ${ComponentsV2Limits.MAX_MEDIA_DESCRIPTION_LENGTH} chars`
							)
						}
					}
				}
			}
		}

		// Container validation (type 17)
		if (compType === ComponentTypeV2.Container) {
			if (Array.isArray(comp.components)) {
				for (const nested of comp.components) {
					if (nested && typeof nested === 'object') {
						validateComponent(nested as Record<string, unknown>, depth + 1)
					}
				}
			}
		}

		// Thumbnail validation (type 11)
		if (compType === ComponentTypeV2.Thumbnail) {
			if (comp.media && typeof comp.media === 'object') {
				const media = comp.media as { url?: string }
				validateAttachmentUrl(media.url)
			}
			// Validate description length
			if (
				typeof comp.description === 'string' &&
				comp.description.length > ComponentsV2Limits.MAX_MEDIA_DESCRIPTION_LENGTH
			) {
				errors.push(`Thumbnail description exceeds ${ComponentsV2Limits.MAX_MEDIA_DESCRIPTION_LENGTH} chars`)
			}
		}

		// File validation (type 13)
		if (compType === ComponentTypeV2.File) {
			if (!comp.file || typeof comp.file !== 'object') {
				errors.push('File component requires file field')
			} else {
				const file = comp.file as { url?: string }
				if (!file.url) {
					errors.push('File component requires file.url')
				} else if (!file.url.startsWith('attachment://')) {
					errors.push('File component only supports attachment:// URLs')
				} else {
					validateAttachmentUrl(file.url)
				}
			}
		}
	}

	function validateAttachmentUrl(url: string | undefined): void {
		if (!url) return
		if (url.startsWith('attachment://') && attachmentFilenames) {
			const filename = url.slice('attachment://'.length)
			if (!attachmentFilenames.has(filename)) {
				errors.push(`Unknown attachment reference: ${url}`)
			}
		}
	}

	// Validate each top-level component
	for (const comp of components) {
		if (comp && typeof comp === 'object') {
			validateComponent(comp as Record<string, unknown>)
		}
	}

	return {
		valid: errors.length === 0,
		errors
	}
}

// ============================================================================
// Phase 14: Classic (V1) Component Validation
// ============================================================================

/**
 * Validate classic (V1) message components according to Discord's rules:
 * - Max 5 action rows per message
 * - Max 5 buttons per action row
 * - Max 1 select menu per action row (cannot mix with buttons)
 * - Max 25 options in a string select menu
 * - String select must have at least 1 option
 *
 * @param components - Array of components to validate
 * @returns Validation result with any errors
 */
export function validateComponents(components: unknown[]): ComponentsV2ValidationResult {
	const errors: string[] = []

	// Check if components is an array
	if (!Array.isArray(components)) {
		return { valid: false, errors: ['Components must be an array'] }
	}

	// Check action row limit
	if (components.length > ComponentLimits.MAX_ACTION_ROWS) {
		errors.push(`Too many action rows: ${components.length} (max ${ComponentLimits.MAX_ACTION_ROWS})`)
	}

	// Validate each action row
	for (let rowIndex = 0; rowIndex < components.length; rowIndex++) {
		const row = components[rowIndex] as Record<string, unknown>

		if (!row || typeof row !== 'object') {
			errors.push(`Invalid action row at index ${rowIndex}`)
			continue
		}

		// Must be ActionRow type
		if (row.type !== ComponentTypeV2.ActionRow) {
			errors.push(`Component at index ${rowIndex} must be ActionRow (type 1)`)
			continue
		}

		const rowComponents = row.components as unknown[]
		if (!Array.isArray(rowComponents)) {
			errors.push(`Action row ${rowIndex} must have components array`)
			continue
		}

		// Count buttons and select menus in this row
		let buttonCount = 0
		let selectCount = 0

		for (let compIndex = 0; compIndex < rowComponents.length; compIndex++) {
			const comp = rowComponents[compIndex] as Record<string, unknown>

			if (!comp || typeof comp !== 'object') {
				errors.push(`Invalid component at row ${rowIndex}, index ${compIndex}`)
				continue
			}

			const compType = comp.type as number

			// Button (type 2)
			if (compType === ComponentTypeV2.Button) {
				buttonCount++
			}
			// Select menus (types 3-8)
			else if (
				compType === ComponentTypeV2.StringSelect ||
				compType === ComponentTypeV2.UserSelect ||
				compType === ComponentTypeV2.RoleSelect ||
				compType === ComponentTypeV2.MentionableSelect ||
				compType === ComponentTypeV2.ChannelSelect
			) {
				selectCount++

				// Validate string select options
				if (compType === ComponentTypeV2.StringSelect) {
					const options = comp.options as unknown[]
					if (!Array.isArray(options)) {
						errors.push(`String select at row ${rowIndex} must have options array`)
					} else {
						if (options.length < ComponentLimits.MIN_SELECT_OPTIONS) {
							errors.push(
								`String select at row ${rowIndex} must have at least ${ComponentLimits.MIN_SELECT_OPTIONS} option`
							)
						}
						if (options.length > ComponentLimits.MAX_SELECT_OPTIONS) {
							errors.push(
								`String select at row ${rowIndex} has too many options: ${options.length} (max ${ComponentLimits.MAX_SELECT_OPTIONS})`
							)
						}
					}
				}
			}
			// Text input (type 4) - only valid in modals, not messages
			else if (compType === ComponentTypeV2.TextInput) {
				errors.push(`Text input at row ${rowIndex} is only valid in modals, not messages`)
			}
		}

		// Check button limit
		if (buttonCount > ComponentLimits.MAX_BUTTONS_PER_ROW) {
			errors.push(
				`Action row ${rowIndex} has too many buttons: ${buttonCount} (max ${ComponentLimits.MAX_BUTTONS_PER_ROW})`
			)
		}

		// Check select menu limit
		if (selectCount > ComponentLimits.MAX_SELECT_MENUS_PER_ROW) {
			errors.push(
				`Action row ${rowIndex} has too many select menus: ${selectCount} (max ${ComponentLimits.MAX_SELECT_MENUS_PER_ROW})`
			)
		}

		// Cannot mix buttons and select menus
		if (buttonCount > 0 && selectCount > 0) {
			errors.push(`Action row ${rowIndex} cannot mix buttons and select menus`)
		}
	}

	return {
		valid: errors.length === 0,
		errors
	}
}

// ============================================================================
// Phase 5A: Invite Helper
// ============================================================================

/**
 * Generate a random invite code
 */
function generateInviteCode(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
	let code = ''
	for (let i = 0; i < InviteLimits.CODE_LENGTH; i++) {
		code += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return code
}
