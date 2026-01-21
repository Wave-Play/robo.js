import type {
	Session as ISession,
	ConnectionState,
	CreateSessionOptions,
	RecordedAction,
	ActionType,
	RecordActionOptions,
	MockMessage,
	MockUser,
	MockInteraction,
	MockInteractionOption,
	MockThread,
	MockRole,
	MockGuildMember,
	MockScheduledEvent,
	MockAutoModRule,
	MockAutoModAction,
	MockInvite,
	MockAttachment,
	DispatchSlashCommandOptions,
	DispatchButtonClickOptions,
	DispatchSelectMenuOptions,
	DispatchModalSubmitOptions,
	DispatchAutocompleteOptions,
	DispatchContextMenuOptions,
	DispatchThreadCreateOptions,
	SessionRecording,
	SessionConfig,
	SeedMessageConfig,
	VoiceServerState,
	SessionLogEntry,
	PermissionOverride,
	PermissionDeniedEvent
} from '../types/index.js'
import { AutoModerationTriggerType } from '../types/index.js'
import { generateSessionId, createMockToken, generateInteractionToken } from '../utils/id.js'
import { generateSnowflake } from '../utils/snowflake.js'
import { MockServerState, createMockUser, createMockGuild, createMockChannel } from './state.js'
import { ActionRecorder } from './recorder.js'
import { LogRecorder } from './log-recorder.js'
import { ScenarioManager } from './scenario/index.js'
import { saveRecording } from './recording-storage.js'
import { mockLogger } from '../core/logger.js'
import { getGatewayServer } from '../core/gateway.js'
import { getStageBridge } from '../core/stage-bridge.js'
import {
	buildMessageCreatePayload,
	buildInteractionCreatePayload,
	buildButtonInteractionPayload,
	buildSelectMenuInteractionPayload,
	buildModalSubmitInteractionPayload,
	buildAutocompleteInteractionPayload,
	buildContextMenuInteractionPayload,
	buildThreadCreatePayload,
	buildThreadUpdatePayload,
	buildThreadDeletePayload,
	buildThreadListSyncPayload,
	buildThreadMemberUpdatePayload,
	buildThreadMembersUpdatePayload,
	buildMessagePollVoteAddPayload,
	buildMessagePollVoteRemovePayload,
	buildGuildStickersUpdatePayload,
	buildGuildEmojisUpdatePayload,
	buildGuildRoleCreatePayload,
	buildGuildRoleUpdatePayload,
	buildGuildRoleDeletePayload,
	buildGuildMemberAddPayload,
	buildGuildMemberUpdatePayload,
	buildGuildMemberRemovePayload,
	buildGuildBanAddPayload,
	buildGuildBanRemovePayload,
	buildGuildScheduledEventCreatePayload,
	buildGuildScheduledEventUpdatePayload,
	buildGuildScheduledEventDeletePayload,
	buildGuildScheduledEventUserAddPayload,
	buildGuildScheduledEventUserRemovePayload,
	buildAutoModerationRuleCreatePayload,
	buildAutoModerationRuleUpdatePayload,
	buildAutoModerationRuleDeletePayload,
	buildAutoModerationActionExecutionPayload,
	buildInviteCreatePayload,
	buildInviteDeletePayload,
	type GatewayPayload
} from '../discord/payloads.js'

// Default TTL: 1 hour
const DEFAULT_TTL = 60 * 60 * 1000

/**
 * Context for propagating metadata from dispatches to bot response actions.
 * Set by dispatch handlers and consumed by recordAction().
 */
interface ActionContext {
	/** Metadata to attach to actions recorded while this context is active */
	metadata?: import('../types/index.js').ActionMetadata
	/** ID of the triggering action (dispatch) to set as triggeredBy */
	triggerActionId?: string
}

/**
 * Represents an isolated test session with its own state
 */
export class Session implements ISession {
	readonly id: string
	readonly token: string
	readonly name?: string
	readonly createdAt: number
	readonly expiresAt: number
	readonly state: MockServerState
	readonly connections: Map<string, ConnectionState>
	readonly config?: SessionConfig

	/**
	 * Voice server state by guild ID
	 * Tracks active voice connections for @discordjs/voice support
	 */
	readonly voiceServers: Map<string, VoiceServerState>

	readonly recorder: ActionRecorder
	readonly logRecorder: LogRecorder
	readonly scenarioManager: ScenarioManager
	private ending = false
	private autoArchiveInterval: ReturnType<typeof setInterval> | null = null

	// Rate limit simulation state
	private _simulateRateLimit = false
	private _rateLimitRetryAfter = 1 // seconds
	private _rateLimitPersistent = false // If true, doesn't auto-disable after triggering
	private _rateLimitScope: 'all' | 'messages' | 'interactions' | 'guilds' | 'channels' = 'all'
	private _rateLimitTriggeredCount = 0 // Track how many times rate limit has been triggered

	// Loop detection state
	private messageCreateTimestamps: number[] = []
	private loopDetected = false
	private loopCooldownTimeout: ReturnType<typeof setTimeout> | null = null
	private _loopProtectionEnabled = true

	// Heartbeat interval (per-session, default matches Discord's standard interval)
	private _heartbeatInterval: number | null = null

	// Permission enforcement state (runtime changeable)
	private _permissionEnforcement: 'none' | 'basic' | 'strict' | null = null
	private _permissionOverrides: Map<string, PermissionOverride> = new Map()
	private _permissionDeniedEvents: PermissionDeniedEvent[] = []
	private static readonly MAX_PERMISSION_DENIED_EVENTS = 100

	// Action context for metadata propagation (Phase 3 simulation support)
	private _actionContext: ActionContext | null = null

	// Loop detection constants
	private static readonly LOOP_THRESHOLD = 10 // events
	private static readonly LOOP_WINDOW_MS = 1000 // 1 second
	private static readonly LOOP_COOLDOWN_MS = 5000 // 5 second recovery

	constructor(options?: CreateSessionOptions) {
		this.id = options?.id ?? generateSessionId()
		this.token = createMockToken(this.id)
		this.name = options?.name
		this.createdAt = Date.now()
		this.expiresAt = this.createdAt + (options?.ttl ?? DEFAULT_TTL)
		this.connections = new Map()
		this.voiceServers = new Map()
		this.config = options?.config

		// Initialize action recorder with optional max actions
		this.recorder = new ActionRecorder(options?.config?.maxActions ?? 10000)

		// Initialize log recorder for capturing bot logs
		this.logRecorder = new LogRecorder(this.id, options?.config?.maxLogs ?? 10000)

		// Initialize scenario manager for simulation support (Phase 4)
		this.scenarioManager = new ScenarioManager()
		// Set session reference for runner creation (Phase 5)
		this.scenarioManager.setSession(this as unknown as import('../types/index.js').Session)

		// Initialize state with optional configuration
		this.state = new MockServerState({
			botUser: options?.config?.botUser,
			applicationId: options?.config?.applicationId
		})

		// Create guilds from config
		if (options?.config?.guilds) {
			for (const guildConfig of options.config.guilds) {
				// Create the guild
				const guild = createMockGuild({
					name: guildConfig.name ?? 'Test Guild',
					ownerId: this.state.botUser.id
				})

				// Add guild to state (uses addGuild to ensure bot member is created)
				this.state.addGuild(guild)

				// Create channels from config, or default to a general channel
				if (guildConfig.channels && guildConfig.channels.length > 0) {
					for (const channelConfig of guildConfig.channels) {
						const channel = createMockChannel({
							guildId: guild.id,
							name: channelConfig.name ?? 'channel',
							type: channelConfig.type ?? 0
						})
						this.state.addChannelToGuild(guild.id, channel)

						// Create seed messages if provided
						if (channelConfig.messages) {
							this.createSeedMessages(channel.id, guild.id, channelConfig.messages)
						}
					}
				} else {
					// Create default general channel if no channels specified
					const channel = createMockChannel({
						guildId: guild.id,
						name: 'general',
						type: 0 // GUILD_TEXT
					})
					this.state.addChannelToGuild(guild.id, channel)
				}
			}
		} else {
			// No guilds configured - create a default guild with just a general channel
			const defaultGuild = createMockGuild({
				name: 'Test Server',
				ownerId: this.state.botUser.id
			})
			this.state.addGuild(defaultGuild)

			// Create only the general channel by default
			// Additional channels can be added via test data
			const generalChannel = createMockChannel({
				guildId: defaultGuild.id,
				name: 'general',
				type: 0, // GUILD_TEXT
				topic: 'Chat about anything and everything here',
				position: 0
			})
			this.state.addChannelToGuild(defaultGuild.id, generalChannel)
		}

		// Create users from config and add as members to all guilds
		if (options?.config?.users && options.config.users.length > 0) {
			const guilds = Array.from(this.state.guilds.values())
			let firstNonBotUser: MockUser | null = null

			for (const userConfig of options.config.users) {
				const user = createMockUser({
					username: userConfig.username ?? 'TestUser',
					bot: userConfig.bot ?? false,
					...userConfig
				})
				this.state.users.set(user.id, user)

				// Track first non-bot user for current user
				if (!firstNonBotUser && !user.bot) {
					firstNonBotUser = user
				}

				// Add user to all guilds as a member
				for (const guild of guilds) {
					this.state.addMemberToGuild(guild.id, user.id, {
						roles: [],
						nick: null
					})
				}
			}

			// Set the first non-bot user as the current user
			if (firstNonBotUser) {
				this.state.currentUser = firstNonBotUser
			}
		}

		// Ensure currentUser is a member of all guilds
		// This is needed whether users were configured or not (default currentUser from getter)
		const currentUser = this.state.currentUser
		const allGuilds = Array.from(this.state.guilds.values())
		for (const guild of allGuilds) {
			if (!this.state.getGuildMember(guild.id, currentUser.id)) {
				this.state.addMemberToGuild(guild.id, currentUser.id, {
					roles: [],
					nick: null
				})
			}
		}

		// Create commands from config (for Stage UI testing)
		if (options?.config?.commands) {
			for (const commandConfig of options.config.commands) {
				this.state.createCommand(commandConfig)
			}
		}

		mockLogger.debug(`Session created: ${this.id}${this.name ? ` (${this.name})` : ''}`)
	}

	/**
	 * Check if session has expired
	 */
	get isExpired(): boolean {
		return Date.now() > this.expiresAt
	}

	/**
	 * Check if session is ending
	 */
	get isEnding(): boolean {
		return this.ending
	}

	/**
	 * Create seed messages with optional reactions
	 * Used during session initialization
	 */
	private createSeedMessages(channelId: string, guildId: string, messages: SeedMessageConfig[]): void {
		for (const msgConfig of messages) {
			// Get or create the author
			let author: MockUser
			if (msgConfig.authorUsername) {
				// Look for existing user with this username
				const existingUser = Array.from(this.state.users.values()).find((u) => u.username === msgConfig.authorUsername)
				if (existingUser) {
					author = existingUser
				} else {
					author = createMockUser({ username: msgConfig.authorUsername })
					this.state.users.set(author.id, author)
				}
			} else {
				// Use current user as default author
				author = this.state.currentUser
			}

			// Create the message
			const message = this.state.createMessage({
				channelId,
				guildId,
				authorId: author.id,
				content: msgConfig.content
			})

			// Add reactions if specified
			if (msgConfig.reactions) {
				for (const reactionConfig of msgConfig.reactions) {
					const count = reactionConfig.count ?? 1
					// Add reactions from test users
					for (let i = 0; i < count; i++) {
						const reactUser = i === 0 ? author : this.state.getOrCreateTestUser(`TestUser${i}`)
						this.state.addReaction(message.id, reactUser.id, { id: null, name: reactionConfig.emoji })
					}
				}
			}
		}
	}

	/**
	 * Dispatch an event to all connections in this session
	 * Sends the event via WebSocket to connected bots
	 */
	async dispatch(event: string, data: unknown): Promise<void> {
		if (this.ending) {
			mockLogger.warn(`Cannot dispatch to ending session: ${this.id}`)
			return
		}

		// Loop detection for MESSAGE_CREATE
		if (event === 'MESSAGE_CREATE' && this._loopProtectionEnabled) {
			if (this.loopDetected) {
				// Still in cooldown, drop silently
				mockLogger.debug(`Dropping MESSAGE_CREATE during loop cooldown`)
				return
			}

			const now = Date.now()
			this.messageCreateTimestamps.push(now)

			// Keep only recent timestamps (within window)
			const windowStart = now - Session.LOOP_WINDOW_MS
			this.messageCreateTimestamps = this.messageCreateTimestamps.filter((t) => t > windowStart)

			// Check if loop threshold exceeded
			if (this.messageCreateTimestamps.length >= Session.LOOP_THRESHOLD) {
				this.triggerLoopProtection(data)
				return
			}
		}

		// Record the dispatched event (uses recordAction to pick up action context)
		const dispatchAction = this.recordAction('dispatch', { event, payload: data })

		// If an action context is active, pin the triggering dispatch action ID so subsequent
		// bot outputs can link back via `triggeredBy` (Phase 3 metadata propagation).
		if (this._actionContext?.metadata && !this._actionContext.triggerActionId) {
			this._actionContext = {
				...this._actionContext,
				triggerActionId: dispatchAction.id
			}
		}

		// Get the guild ID for intent filtering (if present in data)
		const guildId = (data as Record<string, unknown>)?.guild_id as string | undefined

		// Dispatch to WebSocket connections via gateway server
		const gateway = getGatewayServer()
		const dispatched = gateway.dispatchToSession(this.id, event, data, guildId)

		mockLogger.debug(`Session ${this.id} dispatched: ${event} to ${dispatched} connection(s)`)

		// Forward to stage clients (non-blocking)
		try {
			getStageBridge().onSessionDispatch(this.id, event, data)
		} catch {
			// Stage bridge may not be initialized in some contexts
		}
	}

	/**
	 * Dispatch a MESSAGE_CREATE event
	 * Creates a message in state and dispatches it to connected bots
	 *
	 * @param options - Message creation options
	 * @returns The created message
	 */
	async dispatchMessage(options: {
		/** Optional message ID - if not provided, one will be generated */
		id?: string
		channelId: string
		content?: string
		author?: Partial<MockUser> & { id?: string; username?: string }
		guildId?: string
		embeds?: unknown[]
		attachments?: MockAttachment[]
		components?: unknown[]
		/** User IDs that are mentioned in this message */
		mentions?: string[]
		/** Reactions to apply to the message after creation */
		reactions?: Array<{
			emoji: { id: string | null; name: string }
			count: number
			me: boolean
		}>
		/** Message type (default 0 = DEFAULT, 7 = USER_JOIN, 8 = GUILD_BOOST, etc.) */
		type?: number
		/** Reference to another message (for replies) */
		messageReference?: {
			message_id?: string
			channel_id?: string
			guild_id?: string
		}
		/** Call info for DM call messages (MessageType.Call = 3) */
		call?: {
			participants: string[]
			ended_timestamp?: string | null
		}
		/** Role subscription data for subscription purchase messages (MessageType.RoleSubscriptionPurchase = 25) */
		roleSubscriptionData?: {
			roleSubscriptionListingId: string
			tierName: string
			totalMonthsSubscribed: number
			isRenewal: boolean
		}
		/** Message position (for threads/forums) */
		position?: number
	}): Promise<MockMessage> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Get or create author
		let author: MockUser
		if (options.author?.id) {
			// Check if user exists
			const existingUser = this.state.getUser(options.author.id)
			if (existingUser) {
				author = existingUser
			} else {
				// Create and store the user
				author = createMockUser({
					id: options.author.id,
					username: options.author.username ?? 'TestUser',
					bot: options.author.bot ?? false,
					...options.author
				})
				this.state.addUser(author)
			}
		} else {
			// Use current user as default author
			author = this.state.currentUser
		}

		// Validate channel exists
		const channel = this.state.getChannel(options.channelId)
		if (!channel) {
			throw new Error(`Channel not found: ${options.channelId}`)
		}

		// Determine guild ID from channel if not specified
		const guildId = options.guildId ?? channel.guildId

		// Create the message in state
		const message = this.state.createMessage({
			id: options.id,
			channelId: options.channelId,
			guildId,
			authorId: author.id,
			content: options.content ?? '',
			embeds: options.embeds ?? [],
			attachments: options.attachments ?? [],
			components: options.components ?? [],
			mentions: options.mentions ?? [],
			type: options.messageReference ? 19 : options.type, // Type 19 = REPLY when messageReference is present
			message_reference: options.messageReference,
			call: options.call,
			roleSubscriptionData: options.roleSubscriptionData,
			position: options.position
		})

		// Apply reactions if provided
		if (options.reactions && options.reactions.length > 0) {
			for (const reaction of options.reactions) {
				const count = reaction.count ?? 1
				for (let i = 0; i < count; i++) {
					// Use author for first reaction, create test users for additional
					const reactUser = i === 0 ? author : this.state.getOrCreateTestUser(`ReactUser${i}`)
					this.state.addReaction(message.id, reactUser.id, reaction.emoji)
				}
			}
		}

		// Build the MESSAGE_CREATE payload
		const payload = buildMessageCreatePayload({
			message,
			author,
			sessionState: this.state,
			sequence: 0 // Sequence will be set per-connection by gateway
		})

		// Dispatch to connections (sequence handled by gateway)
		await this.dispatch('MESSAGE_CREATE', (payload as GatewayPayload).d)

		return message
	}

	/**
	 * Dispatch a MESSAGE_POLL_VOTE_ADD or MESSAGE_POLL_VOTE_REMOVE event
	 * Adds/removes a vote from a poll and dispatches the event to connected bots
	 *
	 * @param options - Poll vote options
	 * @returns true if the vote was successfully added/removed
	 */
	async dispatchPollVote(options: {
		userId: string
		messageId: string
		answerId: number
		action: 'add' | 'remove'
	}): Promise<boolean> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Validate message exists and has poll
		const message = this.state.getMessage(options.messageId)
		if (!message?.poll) {
			throw new Error(`Message not found or has no poll: ${options.messageId}`)
		}

		// Perform the vote action
		let success: boolean
		if (options.action === 'add') {
			success = this.state.addPollVote(options.messageId, options.userId, options.answerId)
		} else {
			success = this.state.removePollVote(options.messageId, options.userId, options.answerId)
		}

		if (!success) {
			return false
		}

		// Build the appropriate payload
		const payloadBuilder = options.action === 'add' ? buildMessagePollVoteAddPayload : buildMessagePollVoteRemovePayload

		const payload = payloadBuilder({
			userId: options.userId,
			channelId: message.channelId,
			messageId: options.messageId,
			guildId: message.guildId,
			answerId: options.answerId,
			sequence: 0 // Sequence will be set per-connection by gateway
		})

		// Dispatch to connections
		const eventName = options.action === 'add' ? 'MESSAGE_POLL_VOTE_ADD' : 'MESSAGE_POLL_VOTE_REMOVE'
		await this.dispatch(eventName, (payload as GatewayPayload).d)

		return true
	}

	/**
	 * Dispatch a MESSAGE_REACTION_ADD or MESSAGE_REACTION_REMOVE event
	 * Updates state and dispatches to connected bots and Stage UI
	 *
	 * @param options - Reaction options
	 * @returns true if successful, false if message not found
	 */
	async dispatchReaction(options: {
		action: 'add' | 'remove'
		messageId: string
		channelId: string
		userId: string
		emoji: { id: string | null; name: string }
		guildId?: string
	}): Promise<boolean> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Update state
		const reactions =
			options.action === 'add'
				? this.state.addReaction(options.messageId, options.userId, options.emoji)
				: this.state.removeReaction(options.messageId, options.userId, options.emoji)

		if (reactions === undefined) {
			return false
		}

		// Build the payload for Discord gateway
		const gatewayEvent = options.action === 'add' ? 'MESSAGE_REACTION_ADD' : 'MESSAGE_REACTION_REMOVE'
		const payload = {
			user_id: options.userId,
			channel_id: options.channelId,
			message_id: options.messageId,
			guild_id: options.guildId,
			emoji: options.emoji
		}

		// Dispatch to connections
		await this.dispatch(gatewayEvent, payload)

		return true
	}

	/**
	 * Dispatch an INTERACTION_CREATE event for a slash command
	 * Creates an interaction in state and dispatches it to connected bots
	 *
	 * @param options - Slash command options
	 * @returns The created interaction
	 */
	async dispatchSlashCommand(options: DispatchSlashCommandOptions): Promise<MockInteraction> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Get or create user
		let user: MockUser
		if (options.user?.id) {
			const existingUser = this.state.getUser(options.user.id)
			if (existingUser) {
				user = existingUser
			} else {
				user = createMockUser(options.user)
				this.state.addUser(user)
			}
		} else {
			// Use current user as default
			user = this.state.currentUser
		}

		// Determine channel - use provided or find first available
		let channelId = options.channelId
		if (!channelId) {
			const firstGuild = this.state.guilds.values().next().value
			if (firstGuild && firstGuild.channels.length > 0) {
				channelId = firstGuild.channels[0]
			}
		}
		if (!channelId) {
			throw new Error('No channel specified and no channels available in session state')
		}

		// Get guild ID from channel if not specified
		const channel = this.state.getChannel(channelId)
		const guildId = options.guildId ?? channel?.guildId

		// Create interaction
		const now = Date.now()
		const interaction: MockInteraction = {
			id: generateSnowflake(),
			applicationId: this.state.applicationId,
			type: 2, // InteractionType.ApplicationCommand
			token: generateInteractionToken(),
			channelId,
			guildId,
			userId: user.id,
			commandName: options.commandName,
			commandId: generateSnowflake(),
			options: options.options ? this.convertOptionsToArray(options.options) : undefined,
			createdAt: now,
			expiresAt: now + 15 * 60 * 1000 // 15 minutes
		}

		// Store interaction
		this.state.addInteraction(interaction)

		// Build payload
		const payload = buildInteractionCreatePayload({
			interaction,
			user,
			sessionState: this.state,
			sequence: 0 // Will be set per-connection
		})

		// Dispatch to connections
		await this.dispatch('INTERACTION_CREATE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched slash command: /${options.commandName}`)

		return interaction
	}

	/**
	 * Convert options object to array format for Discord API
	 */
	private convertOptionsToArray(options: Record<string, string | number | boolean>): MockInteractionOption[] {
		return Object.entries(options).map(([name, value]) => ({
			name,
			type: typeof value === 'string' ? 3 : typeof value === 'number' ? 4 : 5, // STRING, INTEGER, BOOLEAN
			value
		}))
	}

	/**
	 * Dispatch an INTERACTION_CREATE event for a button click (Phase 3C)
	 * Creates an interaction in state and dispatches it to connected bots
	 *
	 * @param options - Button click options
	 * @returns The created interaction
	 */
	async dispatchButtonClick(options: DispatchButtonClickOptions): Promise<MockInteraction> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Validate message exists in state
		const message = this.state.getMessage(options.messageId)
		if (!message) {
			throw new Error(`Message not found: ${options.messageId}`)
		}

		// Get or create user
		let user: MockUser
		if (options.user?.id) {
			const existingUser = this.state.getUser(options.user.id)
			if (existingUser) {
				user = existingUser
			} else {
				user = createMockUser(options.user)
				this.state.addUser(user)
			}
		} else {
			// Use current user as default
			user = this.state.currentUser
		}

		// Derive channel and guild from message if not specified
		const channelId = options.channelId ?? message.channelId
		const guildId = options.guildId ?? message.guildId

		// Create interaction
		const now = Date.now()
		const interaction: MockInteraction = {
			id: generateSnowflake(),
			applicationId: this.state.applicationId,
			type: 3, // InteractionType.MessageComponent
			token: generateInteractionToken(),
			channelId,
			guildId,
			userId: user.id,
			customId: options.customId,
			componentType: 2, // ComponentType.Button
			messageId: options.messageId,
			createdAt: now,
			expiresAt: now + 15 * 60 * 1000 // 15 minutes
		}

		// Store interaction
		this.state.addInteraction(interaction)

		// Build payload
		const payload = buildButtonInteractionPayload({
			interaction,
			user,
			message,
			sessionState: this.state,
			sequence: 0 // Will be set per-connection
		})

		// Dispatch to connections
		await this.dispatch('INTERACTION_CREATE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched button click: ${options.customId}`)

		return interaction
	}

	/**
	 * Dispatch an INTERACTION_CREATE event for a select menu interaction (Phase 3D)
	 * Creates an interaction in state and dispatches it to connected bots
	 *
	 * @param options - Select menu options
	 * @returns The created interaction
	 */
	async dispatchSelectMenu(options: DispatchSelectMenuOptions): Promise<MockInteraction> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Validate message exists in state
		const message = this.state.getMessage(options.messageId)
		if (!message) {
			throw new Error(`Message not found: ${options.messageId}`)
		}

		// Get or create user
		let user: MockUser
		if (options.user?.id) {
			const existingUser = this.state.getUser(options.user.id)
			if (existingUser) {
				user = existingUser
			} else {
				user = createMockUser(options.user)
				this.state.addUser(user)
			}
		} else {
			// Use current user as default
			user = this.state.currentUser
		}

		// Derive channel and guild from message if not specified
		const channelId = options.channelId ?? message.channelId
		const guildId = options.guildId ?? message.guildId

		// Create interaction
		const now = Date.now()
		const interaction: MockInteraction = {
			id: generateSnowflake(),
			applicationId: this.state.applicationId,
			type: 3, // InteractionType.MessageComponent
			token: generateInteractionToken(),
			channelId,
			guildId,
			userId: user.id,
			customId: options.customId,
			componentType: options.componentType ?? 3, // Default to StringSelect
			messageId: options.messageId,
			values: options.values,
			createdAt: now,
			expiresAt: now + 15 * 60 * 1000 // 15 minutes
		}

		// Store interaction
		this.state.addInteraction(interaction)

		// Build payload
		const payload = buildSelectMenuInteractionPayload({
			interaction,
			user,
			message,
			values: options.values,
			sessionState: this.state,
			sequence: 0 // Will be set per-connection
		})

		// Dispatch to connections
		await this.dispatch('INTERACTION_CREATE', (payload as GatewayPayload).d)

		mockLogger.debug(
			`Session ${this.id} dispatched select menu: ${options.customId} with values [${options.values.join(', ')}]`
		)

		return interaction
	}

	/**
	 * Dispatch an INTERACTION_CREATE event for a modal submit (Phase 3E)
	 * Creates an interaction in state and dispatches it to connected bots
	 *
	 * @param options - Modal submit options
	 * @returns The created interaction
	 */
	async dispatchModalSubmit(options: DispatchModalSubmitOptions): Promise<MockInteraction> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Resolve message if provided (links to original interaction that opened modal)
		let message: MockMessage | undefined
		if (options.messageId) {
			message = this.state.messages.get(options.messageId)
			if (!message) {
				throw new Error(`Message ${options.messageId} not found in session state`)
			}
		}

		// Get or create user
		let user: MockUser
		if (options.user?.id) {
			const existingUser = this.state.getUser(options.user.id)
			if (existingUser) {
				user = existingUser
			} else {
				user = createMockUser(options.user)
				this.state.addUser(user)
			}
		} else {
			// Use current user as default
			user = this.state.currentUser
		}

		// Resolve channel - use provided channelId, derive from message, or get first available
		let channelId = options.channelId
		if (!channelId && message) {
			channelId = message.channelId
		}
		if (!channelId) {
			const firstChannel = this.state.channels.values().next().value
			if (!firstChannel) {
				throw new Error('No channel available for modal submit. Please provide channelId or create a channel first.')
			}
			channelId = firstChannel.id
		}

		// Derive guildId from channel or message if not specified
		let guildId = options.guildId
		if (!guildId && message?.guildId) {
			guildId = message.guildId
		}
		if (!guildId) {
			const channel = this.state.channels.get(channelId)
			if (channel?.guildId) {
				guildId = channel.guildId
			}
		}

		// Create interaction
		const now = Date.now()
		const interaction: MockInteraction = {
			id: generateSnowflake(),
			applicationId: this.state.applicationId,
			type: 5, // InteractionType.ModalSubmit
			token: generateInteractionToken(),
			channelId,
			guildId,
			userId: user.id,
			customId: options.customId,
			modalFields: options.fields,
			messageId: options.messageId, // Link to original message if provided
			createdAt: now,
			expiresAt: now + 15 * 60 * 1000 // 15 minutes
		}

		// Store interaction
		this.state.addInteraction(interaction)

		// Build payload
		const payload = buildModalSubmitInteractionPayload({
			interaction,
			user,
			sessionState: this.state,
			sequence: 0, // Will be set per-connection
			message // Include message to link to original interaction
		})

		// Dispatch to connections
		await this.dispatch('INTERACTION_CREATE', (payload as GatewayPayload).d)

		mockLogger.debug(
			`Session ${this.id} dispatched modal submit: ${options.customId} with ${
				Object.keys(options.fields).length
			} fields`
		)

		return interaction
	}

	/**
	 * Dispatch an INTERACTION_CREATE event for autocomplete (Phase 3F)
	 * Creates an autocomplete interaction for testing bot autocomplete handlers
	 *
	 * @param options - Autocomplete options including focused option
	 * @returns The created interaction
	 */
	async dispatchAutocomplete(options: DispatchAutocompleteOptions): Promise<MockInteraction> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Get or create user (same pattern as other dispatch methods)
		let user: MockUser
		if (options.user?.id) {
			const existingUser = this.state.getUser(options.user.id)
			if (existingUser) {
				user = existingUser
			} else {
				user = createMockUser(options.user)
				this.state.addUser(user)
			}
		} else {
			// Use current user as default
			user = this.state.currentUser
		}

		// Resolve channel
		let channelId = options.channelId
		if (!channelId) {
			const firstGuild = this.state.guilds.values().next().value
			if (firstGuild && firstGuild.channels.length > 0) {
				channelId = firstGuild.channels[0]
			}
		}
		if (!channelId) {
			throw new Error('No channel specified and no channels available in session state')
		}

		// Get guild ID from channel if not specified
		const channel = this.state.getChannel(channelId)
		const guildId = options.guildId ?? channel?.guildId

		// Build options array with focused option
		const interactionOptions: MockInteractionOption[] = []

		// Add the focused option (required for autocomplete)
		interactionOptions.push({
			name: options.focusedOption.name,
			type: options.focusedOption.type ?? 3, // Default to STRING
			value: options.focusedOption.value,
			focused: true
		})

		// Add any other pre-filled options
		if (options.options) {
			for (const [name, value] of Object.entries(options.options)) {
				if (name !== options.focusedOption.name) {
					// Don't duplicate focused option
					interactionOptions.push({
						name,
						type: typeof value === 'string' ? 3 : typeof value === 'number' ? 4 : 5,
						value
					})
				}
			}
		}

		// Create interaction
		const now = Date.now()
		const interaction: MockInteraction = {
			id: generateSnowflake(),
			applicationId: this.state.applicationId,
			type: 4, // InteractionType.ApplicationCommandAutocomplete
			token: generateInteractionToken(),
			channelId,
			guildId,
			userId: user.id,
			commandName: options.commandName,
			commandId: generateSnowflake(),
			options: interactionOptions,
			createdAt: now,
			expiresAt: now + 15 * 60 * 1000
		}

		// Store interaction
		this.state.addInteraction(interaction)

		// Build payload
		const payload = buildAutocompleteInteractionPayload({
			interaction,
			user,
			sessionState: this.state,
			sequence: 0
		})

		// Dispatch to connections
		await this.dispatch('INTERACTION_CREATE', (payload as GatewayPayload).d)

		mockLogger.debug(
			`Session ${this.id} dispatched autocomplete: /${options.commandName} option:${options.focusedOption.name}`
		)

		return interaction
	}

	/**
	 * Dispatch an INTERACTION_CREATE event for a context menu command (Phase 3G)
	 * Creates an interaction in state and dispatches it to connected bots
	 *
	 * @param options - Context menu command options
	 * @returns The created interaction
	 */
	async dispatchContextMenu(options: DispatchContextMenuOptions): Promise<MockInteraction> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Get or create invoking user
		let user: MockUser
		if (options.user?.id) {
			const existingUser = this.state.getUser(options.user.id)
			if (existingUser) {
				user = existingUser
			} else {
				user = createMockUser(options.user)
				this.state.addUser(user)
			}
		} else {
			// Use current user as default
			user = this.state.currentUser
		}

		// Resolve target based on command type
		let targetUser: MockUser | undefined
		let targetMessage: MockMessage | undefined
		let channelId = options.channelId
		let guildId = options.guildId

		if (options.contextMenuType === 2) {
			// USER command - target is a user
			targetUser = this.state.getUser(options.targetId)
			if (!targetUser) {
				// Create a mock target user if not found
				targetUser = createMockUser({ id: options.targetId, username: 'TargetUser' })
				this.state.addUser(targetUser)
			}
			// For user commands, channel may be optional (guild context)
			if (!channelId) {
				const firstGuild = this.state.guilds.values().next().value
				if (firstGuild && firstGuild.channels.length > 0) {
					channelId = firstGuild.channels[0]
				}
			}
		} else if (options.contextMenuType === 3) {
			// MESSAGE command - target is a message
			targetMessage = this.state.getMessage(options.targetId)
			if (!targetMessage) {
				throw new Error(`Target message not found: ${options.targetId}`)
			}
			// Derive channel and guild from target message
			channelId = channelId ?? targetMessage.channelId
			guildId = guildId ?? targetMessage.guildId
		}

		if (!channelId) {
			throw new Error('No channel specified and cannot derive from context')
		}

		// Get guild ID from channel if not specified
		if (!guildId) {
			const channel = this.state.getChannel(channelId)
			guildId = channel?.guildId
		}

		// Create interaction
		const now = Date.now()
		const interaction: MockInteraction = {
			id: generateSnowflake(),
			applicationId: this.state.applicationId,
			type: 2, // InteractionType.ApplicationCommand (context menus are still APPLICATION_COMMAND)
			token: generateInteractionToken(),
			channelId,
			guildId,
			userId: user.id,
			commandName: options.commandName,
			commandId: generateSnowflake(),
			targetId: options.targetId,
			contextMenuType: options.contextMenuType,
			createdAt: now,
			expiresAt: now + 15 * 60 * 1000 // 15 minutes
		}

		// Store interaction
		this.state.addInteraction(interaction)

		// Build payload
		const payload = buildContextMenuInteractionPayload({
			interaction,
			user,
			targetUser,
			targetMessage,
			sessionState: this.state,
			sequence: 0 // Will be set per-connection
		})

		// Dispatch to connections
		await this.dispatch('INTERACTION_CREATE', (payload as GatewayPayload).d)

		const typeLabel = options.contextMenuType === 2 ? 'user' : 'message'
		mockLogger.debug(`Session ${this.id} dispatched ${typeLabel} context menu: ${options.commandName}`)

		return interaction
	}

	// ============================================================================
	// Thread Dispatch Methods (Phase 4D)
	// ============================================================================

	/**
	 * Dispatch a THREAD_CREATE event
	 * Creates a thread in state and dispatches it to connected bots
	 *
	 * @param options - Thread creation options
	 * @returns The created thread
	 */
	async dispatchThreadCreate(options: DispatchThreadCreateOptions): Promise<MockThread> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Validate parent channel exists
		const parentChannel = this.state.getChannel(options.parentChannelId)
		if (!parentChannel) {
			throw new Error(`Parent channel not found: ${options.parentChannelId}`)
		}

		// Validate parent channel type (must be text or announcement)
		if (parentChannel.type !== 0 && parentChannel.type !== 5) {
			throw new Error(
				`Cannot create thread in channel type ${parentChannel.type}. Must be text (0) or announcement (5)`
			)
		}

		// Get or create owner user
		let owner: MockUser
		if (options.user?.id) {
			const existingUser = this.state.getUser(options.user.id)
			if (existingUser) {
				owner = existingUser
			} else {
				owner = createMockUser(options.user)
				this.state.addUser(owner)
			}
		} else {
			// Use current user as default
			owner = this.state.currentUser
		}

		// Determine thread type based on parent channel or explicit type
		const threadType = options.type ?? (parentChannel.type === 5 ? 10 : 11) // Announcement thread or public thread

		// Create thread in state
		const thread = this.state.createThread({
			name: options.name,
			type: threadType,
			parentId: options.parentChannelId,
			ownerId: owner.id,
			autoArchiveDuration: options.autoArchiveDuration,
			invitable: options.invitable
		})

		// Build payload
		const payload = buildThreadCreatePayload({
			thread,
			sessionState: this.state,
			sequence: 0, // Will be set per-connection
			newlyCreated: true
		})

		// Record the action
		this.recordAction('thread_created', {
			threadId: thread.id,
			name: thread.name,
			type: thread.type,
			parentId: thread.parentId,
			ownerId: owner.id
		})

		// Dispatch to connections
		await this.dispatch('THREAD_CREATE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched thread create: ${options.name}`)

		return thread
	}

	/**
	 * Dispatch a THREAD_UPDATE event
	 * Updates thread metadata and dispatches the change
	 *
	 * @param threadId - ID of the thread to update
	 * @param updates - Thread updates (name, archived, locked, etc.)
	 * @returns The updated thread
	 */
	async dispatchThreadUpdate(
		threadId: string,
		updates: {
			name?: string
			archived?: boolean
			locked?: boolean
			autoArchiveDuration?: 60 | 1440 | 4320 | 10080
			invitable?: boolean
		}
	): Promise<MockThread> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Update thread in state
		const thread = this.state.updateThread(threadId, {
			name: updates.name,
			archived: updates.archived,
			locked: updates.locked,
			auto_archive_duration: updates.autoArchiveDuration,
			invitable: updates.invitable
		})

		if (!thread) {
			throw new Error(`Thread not found: ${threadId}`)
		}

		// Build payload
		const payload = buildThreadUpdatePayload({
			thread,
			sessionState: this.state,
			sequence: 0
		})

		// Record the action
		this.recordAction('thread_updated', {
			threadId: thread.id,
			updates
		})

		// Dispatch to connections
		await this.dispatch('THREAD_UPDATE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched thread update: ${thread.name}`)

		return thread
	}

	/**
	 * Dispatch a THREAD_DELETE event
	 * Deletes a thread and dispatches the event
	 *
	 * @param threadId - ID of the thread to delete
	 */
	async dispatchThreadDelete(threadId: string): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Get thread before deleting
		const thread = this.state.getThread(threadId)
		if (!thread) {
			throw new Error(`Thread not found: ${threadId}`)
		}

		// Store info for payload before deletion
		const { guildId, parentId, type } = thread

		// Delete from state
		this.state.deleteThread(threadId)

		// Build payload
		const payload = buildThreadDeletePayload({
			threadId,
			guildId: guildId!,
			parentId: parentId!,
			type: type as 10 | 11 | 12,
			sequence: 0
		})

		// Record the action
		this.recordAction('thread_deleted', {
			threadId,
			guildId,
			parentId,
			type
		})

		// Dispatch to connections
		await this.dispatch('THREAD_DELETE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched thread delete: ${threadId}`)
	}

	/**
	 * Dispatch THREAD_MEMBER_UPDATE for bot joining a thread
	 *
	 * @param threadId - ID of the thread to join
	 */
	async dispatchThreadJoin(threadId: string): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		const thread = this.state.getThread(threadId)
		if (!thread) {
			throw new Error(`Thread not found: ${threadId}`)
		}

		// Add bot user to thread
		const member = this.state.addThreadMember(threadId, this.state.botUser.id)
		if (!member) {
			throw new Error(`Failed to add bot to thread: ${threadId}`)
		}

		// Build payload
		const payload = buildThreadMemberUpdatePayload({
			threadId,
			guildId: thread.guildId!,
			member,
			sequence: 0
		})

		// Record the action
		this.recordAction('thread_member_added', {
			threadId,
			userId: this.state.botUser.id
		})

		// Dispatch to connections
		await this.dispatch('THREAD_MEMBER_UPDATE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} bot joined thread: ${threadId}`)
	}

	/**
	 * Dispatch THREAD_MEMBER_UPDATE for bot leaving a thread
	 *
	 * @param threadId - ID of the thread to leave
	 */
	async dispatchThreadLeave(threadId: string): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		const thread = this.state.getThread(threadId)
		if (!thread) {
			throw new Error(`Thread not found: ${threadId}`)
		}

		// Get member info before removal
		const member = this.state.getThreadMember(threadId, this.state.botUser.id)
		if (!member) {
			mockLogger.warn(`Bot is not a member of thread: ${threadId}`)
			return
		}

		// Remove bot from thread
		this.state.removeThreadMember(threadId, this.state.botUser.id)

		// Note: Discord doesn't send THREAD_MEMBER_UPDATE on leave, only on join
		// Instead, THREAD_MEMBERS_UPDATE is sent if GuildMembers intent is enabled
		// For the bot's own membership, the thread simply becomes "invisible"

		// Record the action
		this.recordAction('thread_member_removed', {
			threadId,
			userId: this.state.botUser.id
		})

		mockLogger.debug(`Session ${this.id} bot left thread: ${threadId}`)
	}

	/**
	 * Dispatch THREAD_MEMBERS_UPDATE for adding a user to a thread
	 * This is for testing - simulates another user being added
	 *
	 * @param threadId - ID of the thread
	 * @param userId - ID of the user to add
	 */
	async dispatchThreadMemberAdd(threadId: string, userId: string): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		const thread = this.state.getThread(threadId)
		if (!thread) {
			throw new Error(`Thread not found: ${threadId}`)
		}

		// Add user to thread
		const member = this.state.addThreadMember(threadId, userId)
		if (!member) {
			throw new Error(`Failed to add user to thread: ${threadId}`)
		}

		// Build payload (THREAD_MEMBERS_UPDATE for other users)
		const payload = buildThreadMembersUpdatePayload({
			threadId,
			guildId: thread.guildId!,
			memberCount: thread.memberCount,
			addedMembers: [member],
			sequence: 0
		})

		// Record the action
		this.recordAction('thread_member_added', {
			threadId,
			userId
		})

		// Dispatch to connections
		await this.dispatch('THREAD_MEMBERS_UPDATE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} added user ${userId} to thread: ${threadId}`)
	}

	/**
	 * Dispatch THREAD_MEMBERS_UPDATE for removing a user from a thread
	 * This is for testing - simulates another user being removed
	 *
	 * @param threadId - ID of the thread
	 * @param userId - ID of the user to remove
	 */
	async dispatchThreadMemberRemove(threadId: string, userId: string): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		const thread = this.state.getThread(threadId)
		if (!thread) {
			throw new Error(`Thread not found: ${threadId}`)
		}

		// Check if user is a member
		const member = this.state.getThreadMember(threadId, userId)
		if (!member) {
			mockLogger.warn(`User ${userId} is not a member of thread: ${threadId}`)
			return
		}

		// Remove user from thread
		this.state.removeThreadMember(threadId, userId)

		// Build payload
		const payload = buildThreadMembersUpdatePayload({
			threadId,
			guildId: thread.guildId!,
			memberCount: thread.memberCount,
			removedMemberIds: [userId],
			sequence: 0
		})

		// Record the action
		this.recordAction('thread_member_removed', {
			threadId,
			userId
		})

		// Dispatch to connections
		await this.dispatch('THREAD_MEMBERS_UPDATE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} removed user ${userId} from thread: ${threadId}`)
	}

	/**
	 * Dispatch THREAD_LIST_SYNC for syncing active threads
	 * Sent when bot gains access to channels
	 *
	 * @param guildId - ID of the guild
	 * @param channelIds - Optional specific channel IDs to sync (if not provided, syncs all)
	 */
	async dispatchThreadListSync(guildId: string, channelIds?: string[]): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Get all active threads for the guild (or specific channels)
		let threads = this.state.getActiveThreadsForGuild(guildId)
		if (channelIds && channelIds.length > 0) {
			threads = threads.filter((t) => channelIds.includes(t.parentId))
		}

		// Get bot's membership in these threads
		const members = threads
			.map((t) => this.state.getThreadMember(t.id, this.state.botUser.id))
			.filter((m) => m !== undefined)

		// Build payload
		const payload = buildThreadListSyncPayload({
			guildId,
			channelIds,
			threads,
			members: members as NonNullable<(typeof members)[number]>[],
			sequence: 0
		})

		// Dispatch to connections
		await this.dispatch('THREAD_LIST_SYNC', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched thread list sync: ${threads.length} threads`)
	}

	// ============================================================================
	// Sticker Events (Phase 4I)
	// ============================================================================

	/**
	 * Dispatch GUILD_STICKERS_UPDATE event when stickers change
	 *
	 * @param guildId - The guild whose stickers changed
	 */
	async dispatchGuildStickersUpdate(guildId: string): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Get current guild stickers
		const stickers = this.state.getGuildStickers(guildId)

		// Build payload
		const payload = buildGuildStickersUpdatePayload({
			guildId,
			stickers,
			sequence: 0
		})

		// Dispatch to connections
		await this.dispatch('GUILD_STICKERS_UPDATE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched guild stickers update: ${stickers.length} stickers`)
	}

	// ============================================================================
	// Emoji Events (Phase 4K)
	// ============================================================================

	/**
	 * Dispatch GUILD_EMOJIS_UPDATE event when emojis change
	 *
	 * @param guildId - The guild whose emojis changed
	 */
	async dispatchGuildEmojisUpdate(guildId: string): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Get current guild emojis
		const emojis = this.state.getGuildEmojis(guildId)

		// Build payload
		const payload = buildGuildEmojisUpdatePayload({
			guildId,
			emojis,
			sequence: 0
		})

		// Dispatch to connections
		await this.dispatch('GUILD_EMOJIS_UPDATE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched guild emojis update: ${emojis.length} emojis`)
	}

	// ============================================================================
	// Role Event Dispatching (Phase 4L)
	// ============================================================================

	/**
	 * Dispatch GUILD_ROLE_CREATE event when a role is created
	 *
	 * @param guildId - The guild where the role was created
	 * @param role - The created role
	 */
	async dispatchGuildRoleCreate(guildId: string, role: MockRole): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Build payload
		const payload = buildGuildRoleCreatePayload({
			guildId,
			role,
			sequence: 0
		})

		// Dispatch to connections
		await this.dispatch('GUILD_ROLE_CREATE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched role create: ${role.name} in guild ${guildId}`)
	}

	/**
	 * Dispatch GUILD_ROLE_UPDATE event when a role is updated
	 *
	 * @param guildId - The guild where the role was updated
	 * @param role - The updated role
	 */
	async dispatchGuildRoleUpdate(guildId: string, role: MockRole): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Build payload
		const payload = buildGuildRoleUpdatePayload({
			guildId,
			role,
			sequence: 0
		})

		// Dispatch to connections
		await this.dispatch('GUILD_ROLE_UPDATE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched role update: ${role.name} in guild ${guildId}`)
	}

	/**
	 * Dispatch GUILD_ROLE_DELETE event when a role is deleted
	 *
	 * @param guildId - The guild where the role was deleted
	 * @param roleId - The ID of the deleted role
	 */
	async dispatchGuildRoleDelete(guildId: string, roleId: string): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Build payload
		const payload = buildGuildRoleDeletePayload({
			guildId,
			roleId,
			sequence: 0
		})

		// Dispatch to connections
		await this.dispatch('GUILD_ROLE_DELETE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched role delete: ${roleId} in guild ${guildId}`)
	}

	// ============================================================================
	// Guild Member Event Dispatching (Phase 4L)
	// ============================================================================

	/**
	 * Dispatch GUILD_MEMBER_ADD event when a member joins a guild
	 *
	 * @param guildId - The guild where the member joined
	 * @param member - The member who joined
	 * @param user - The user associated with the member
	 */
	async dispatchGuildMemberAdd(guildId: string, member: MockGuildMember, user: MockUser): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Build payload
		const payload = buildGuildMemberAddPayload({
			guildId,
			member,
			user,
			sequence: 0
		})

		// Dispatch to connections
		await this.dispatch('GUILD_MEMBER_ADD', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched member add: ${user.username} in guild ${guildId}`)
	}

	/**
	 * Dispatch GUILD_MEMBER_UPDATE event when a member is updated
	 *
	 * @param guildId - The guild where the member was updated
	 * @param member - The updated member
	 * @param user - The user associated with the member
	 */
	async dispatchGuildMemberUpdate(guildId: string, member: MockGuildMember, user: MockUser): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Build payload
		const payload = buildGuildMemberUpdatePayload({
			guildId,
			member,
			user,
			sequence: 0
		})

		// Dispatch to connections
		await this.dispatch('GUILD_MEMBER_UPDATE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched member update: ${user.username} in guild ${guildId}`)
	}

	/**
	 * Dispatch GUILD_MEMBER_REMOVE event when a member leaves or is removed from a guild
	 *
	 * @param guildId - The guild where the member was removed
	 * @param user - The user who was removed
	 */
	async dispatchGuildMemberRemove(guildId: string, user: MockUser): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Build payload
		const payload = buildGuildMemberRemovePayload({
			guildId,
			user,
			sequence: 0
		})

		// Dispatch to connections
		await this.dispatch('GUILD_MEMBER_REMOVE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched member remove: ${user.username} in guild ${guildId}`)
	}

	// ============================================================================
	// Guild Ban Event Dispatching (Phase 4L-B)
	// ============================================================================

	/**
	 * Dispatch GUILD_BAN_ADD event when a user is banned
	 *
	 * @param guildId - The guild where the user was banned
	 * @param user - The user who was banned
	 */
	async dispatchGuildBanAdd(guildId: string, user: MockUser): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Build payload
		const payload = buildGuildBanAddPayload({
			guildId,
			user,
			sequence: 0
		})

		// Dispatch to connections
		await this.dispatch('GUILD_BAN_ADD', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched ban add: ${user.username} in guild ${guildId}`)
	}

	/**
	 * Dispatch GUILD_BAN_REMOVE event when a user is unbanned
	 *
	 * @param guildId - The guild where the user was unbanned
	 * @param user - The user who was unbanned
	 */
	async dispatchGuildBanRemove(guildId: string, user: MockUser): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		// Build payload
		const payload = buildGuildBanRemovePayload({
			guildId,
			user,
			sequence: 0
		})

		// Dispatch to connections
		await this.dispatch('GUILD_BAN_REMOVE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched ban remove: ${user.username} in guild ${guildId}`)
	}

	// ============================================================================
	// Scheduled Event Dispatching (Phase 5B)
	// ============================================================================

	/**
	 * Dispatch GUILD_SCHEDULED_EVENT_CREATE event
	 *
	 * @param event - The scheduled event that was created
	 */
	async dispatchGuildScheduledEventCreate(event: MockScheduledEvent): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		const payload = buildGuildScheduledEventCreatePayload({
			event,
			state: this.state,
			sequence: 0
		})

		await this.dispatch('GUILD_SCHEDULED_EVENT_CREATE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched scheduled event create: ${event.name} in guild ${event.guildId}`)
	}

	/**
	 * Dispatch GUILD_SCHEDULED_EVENT_UPDATE event
	 *
	 * @param event - The scheduled event that was updated
	 */
	async dispatchGuildScheduledEventUpdate(event: MockScheduledEvent): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		const payload = buildGuildScheduledEventUpdatePayload({
			event,
			state: this.state,
			sequence: 0
		})

		await this.dispatch('GUILD_SCHEDULED_EVENT_UPDATE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched scheduled event update: ${event.name} in guild ${event.guildId}`)
	}

	/**
	 * Dispatch GUILD_SCHEDULED_EVENT_DELETE event
	 *
	 * @param event - The scheduled event that was deleted
	 */
	async dispatchGuildScheduledEventDelete(event: MockScheduledEvent): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		const payload = buildGuildScheduledEventDeletePayload({
			event,
			state: this.state,
			sequence: 0
		})

		await this.dispatch('GUILD_SCHEDULED_EVENT_DELETE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched scheduled event delete: ${event.name} in guild ${event.guildId}`)
	}

	/**
	 * Dispatch GUILD_SCHEDULED_EVENT_USER_ADD event
	 *
	 * @param guildId - The guild ID
	 * @param eventId - The scheduled event ID
	 * @param userId - The user ID who subscribed
	 */
	async dispatchGuildScheduledEventUserAdd(guildId: string, eventId: string, userId: string): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		const payload = buildGuildScheduledEventUserAddPayload({
			guildId,
			eventId,
			userId,
			sequence: 0
		})

		await this.dispatch('GUILD_SCHEDULED_EVENT_USER_ADD', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched scheduled event user add: ${userId} to event ${eventId}`)
	}

	/**
	 * Dispatch GUILD_SCHEDULED_EVENT_USER_REMOVE event
	 *
	 * @param guildId - The guild ID
	 * @param eventId - The scheduled event ID
	 * @param userId - The user ID who unsubscribed
	 */
	async dispatchGuildScheduledEventUserRemove(guildId: string, eventId: string, userId: string): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		const payload = buildGuildScheduledEventUserRemovePayload({
			guildId,
			eventId,
			userId,
			sequence: 0
		})

		await this.dispatch('GUILD_SCHEDULED_EVENT_USER_REMOVE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched scheduled event user remove: ${userId} from event ${eventId}`)
	}

	// ============================================================================
	// Invite Event Dispatching (Phase 5A)
	// ============================================================================

	/**
	 * Dispatch INVITE_CREATE event
	 *
	 * @param invite - The invite that was created
	 */
	async dispatchInviteCreate(invite: MockInvite): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		const payload = buildInviteCreatePayload({
			invite,
			state: this.state,
			sequence: 0
		})

		await this.dispatch('INVITE_CREATE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched invite create: ${invite.code}`)
	}

	/**
	 * Dispatch INVITE_DELETE event
	 *
	 * @param invite - The invite that was deleted
	 */
	async dispatchInviteDelete(invite: MockInvite): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		const payload = buildInviteDeletePayload({
			invite,
			sequence: 0
		})

		await this.dispatch('INVITE_DELETE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched invite delete: ${invite.code}`)
	}

	// ============================================================================
	// Auto-Moderation Event Dispatching (Phase 5C)
	// ============================================================================

	/**
	 * Dispatch AUTO_MODERATION_RULE_CREATE event
	 *
	 * @param rule - The auto-mod rule that was created
	 */
	async dispatchAutoModerationRuleCreate(rule: MockAutoModRule): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		const payload = buildAutoModerationRuleCreatePayload({
			rule,
			sequence: 0
		})

		await this.dispatch('AUTO_MODERATION_RULE_CREATE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched auto-mod rule create: ${rule.name} in guild ${rule.guildId}`)
	}

	/**
	 * Dispatch AUTO_MODERATION_RULE_UPDATE event
	 *
	 * @param rule - The auto-mod rule that was updated
	 */
	async dispatchAutoModerationRuleUpdate(rule: MockAutoModRule): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		const payload = buildAutoModerationRuleUpdatePayload({
			rule,
			sequence: 0
		})

		await this.dispatch('AUTO_MODERATION_RULE_UPDATE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched auto-mod rule update: ${rule.name} in guild ${rule.guildId}`)
	}

	/**
	 * Dispatch AUTO_MODERATION_RULE_DELETE event
	 *
	 * @param rule - The auto-mod rule that was deleted
	 */
	async dispatchAutoModerationRuleDelete(rule: MockAutoModRule): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		const payload = buildAutoModerationRuleDeletePayload({
			rule,
			sequence: 0
		})

		await this.dispatch('AUTO_MODERATION_RULE_DELETE', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched auto-mod rule delete: ${rule.name} in guild ${rule.guildId}`)
	}

	/**
	 * Dispatch AUTO_MODERATION_ACTION_EXECUTION event
	 *
	 * @param options - The action execution details
	 */
	async dispatchAutoModerationActionExecution(options: {
		guildId: string
		action: MockAutoModAction
		ruleId: string
		ruleTriggerType: AutoModerationTriggerType
		userId: string
		channelId?: string
		messageId?: string
		content: string
		matchedKeyword?: string
		matchedContent?: string
	}): Promise<void> {
		if (this.ending) {
			throw new Error(`Cannot dispatch to ending session: ${this.id}`)
		}

		const payload = buildAutoModerationActionExecutionPayload({
			...options,
			matchedKeyword: options.matchedKeyword ?? null,
			matchedContent: options.matchedContent ?? null,
			sequence: 0
		})

		await this.dispatch('AUTO_MODERATION_ACTION_EXECUTION', (payload as GatewayPayload).d)

		mockLogger.debug(`Session ${this.id} dispatched auto-mod action execution for rule ${options.ruleId}`)
	}

	/**
	 * Record an action from the bot (REST API call, Gateway message, etc.)
	 * Automatically merges in the current action context if metadata/triggeredBy not provided.
	 */
	recordAction(type: ActionType, data: unknown, options?: RecordActionOptions): RecordedAction {
		const context = this._actionContext
		const mergedOptions: RecordActionOptions = {
			...options,
			// Only merge metadata if not explicitly provided
			metadata: options?.metadata ?? context?.metadata,
			// Only merge triggeredBy if not explicitly provided
			triggeredBy: options?.triggeredBy ?? context?.triggerActionId
		}
		return this.recorder.record(type, data, mergedOptions)
	}

	/**
	 * Set the action context for metadata propagation.
	 * Actions recorded while this context is active will inherit the metadata.
	 */
	setActionContext(context: ActionContext | null): void {
		this._actionContext = context
	}

	/**
	 * Get the current action context.
	 */
	getActionContext(): ActionContext | null {
		return this._actionContext
	}

	/**
	 * Clear the action context.
	 */
	clearActionContext(): void {
		this._actionContext = null
	}

	/**
	 * Get all recorded actions for test assertions
	 */
	getActions(): RecordedAction[] {
		return this.recorder.getAll()
	}

	/**
	 * Get actions since a specific timestamp
	 */
	getActionsSince(timestamp: number): RecordedAction[] {
		return this.recorder.getSince(timestamp)
	}

	/**
	 * Get actions by type
	 */
	getActionsByType(type: ActionType): RecordedAction[] {
		return this.recorder.getByType(type)
	}

	/**
	 * Get message_sent actions
	 */
	getMessagesSent(): RecordedAction[] {
		return this.recorder.getMessagesSent()
	}

	/**
	 * Get all interaction response actions
	 */
	getInteractionResponses(): RecordedAction[] {
		return this.recorder.getInteractionResponses()
	}

	/**
	 * Get all REST request actions
	 */
	getRestRequests(): RecordedAction[] {
		return this.recorder.getRestRequests()
	}

	/**
	 * Get all Gateway WebSocket message actions (client → server)
	 */
	getGatewayMessages(): RecordedAction[] {
		return this.recorder.getGatewayMessages()
	}

	/**
	 * Get dispatch events (server → client)
	 */
	getDispatches(): RecordedAction[] {
		return this.recorder.getDispatches()
	}

	/**
	 * Clear recorded actions without resetting state
	 */
	clearActions(): void {
		this.recorder.clear()
	}

	// ============================================================================
	// Log Recording (for Logs Panel)
	// ============================================================================

	/**
	 * Record a log entry from a connected bot
	 * @param entry The log entry (without id, which will be generated)
	 */
	recordLog(entry: Omit<SessionLogEntry, 'id'>): SessionLogEntry {
		const logEntry = this.logRecorder.record(entry)

		// Forward to Stage UI in real-time
		try {
			getStageBridge().onLogEntry(this.id, logEntry)
		} catch {
			// Stage bridge may not be initialized in some contexts
		}

		return logEntry
	}

	/**
	 * Get all captured logs
	 */
	getLogs(): SessionLogEntry[] {
		return this.logRecorder.getAll()
	}

	/**
	 * Get logs since a timestamp
	 */
	getLogsSince(timestamp: number): SessionLogEntry[] {
		return this.logRecorder.getSince(timestamp)
	}

	/**
	 * Clear recorded logs without resetting state
	 */
	clearLogs(): void {
		this.logRecorder.clear()
	}

	/**
	 * Get the number of recorded actions
	 */
	get actionCount(): number {
		return this.recorder.length
	}

	// ============================================================================
	// Rate Limit Simulation (Phase 13)
	// ============================================================================

	/**
	 * Enable rate limit simulation for testing
	 * When enabled, matching API requests will return a 429 response
	 *
	 * @param config - Rate limit configuration or simple enabled boolean for backward compatibility
	 * @param retryAfter - Retry-After value in seconds (only used when config is boolean)
	 */
	setRateLimitSimulation(
		config:
			| boolean
			| {
					enabled: boolean
					retryAfter?: number
					persistent?: boolean
					scope?: 'all' | 'messages' | 'interactions' | 'guilds' | 'channels'
			  },
		retryAfter = 1
	): void {
		if (typeof config === 'boolean') {
			// Backward compatibility: simple boolean + retryAfter
			this._simulateRateLimit = config
			this._rateLimitRetryAfter = retryAfter
		} else {
			// Full config object
			this._simulateRateLimit = config.enabled
			this._rateLimitRetryAfter = config.retryAfter ?? 1
			this._rateLimitPersistent = config.persistent ?? false
			this._rateLimitScope = config.scope ?? 'all'
		}

		// Reset triggered count when enabling
		if (this._simulateRateLimit) {
			this._rateLimitTriggeredCount = 0
		}
	}

	/**
	 * Check if rate limit simulation should trigger for a given endpoint
	 * If triggered, returns the retry-after value and optionally disables simulation
	 * Returns null if not simulating rate limit or endpoint doesn't match scope
	 *
	 * @param endpoint - Optional endpoint path to check against scope
	 */
	checkRateLimit(endpoint?: string): { retryAfter: number } | null {
		if (!this._simulateRateLimit) {
			return null
		}

		// Check if endpoint matches the configured scope
		if (endpoint && !this.matchesRateLimitScope(endpoint)) {
			return null
		}

		const retryAfter = this._rateLimitRetryAfter
		this._rateLimitTriggeredCount++

		// Only auto-disable if NOT in persistent mode
		if (!this._rateLimitPersistent) {
			this._simulateRateLimit = false
		}

		return { retryAfter }
	}

	/**
	 * Check if an endpoint matches the configured rate limit scope
	 */
	private matchesRateLimitScope(endpoint: string): boolean {
		switch (this._rateLimitScope) {
			case 'all':
				return true
			case 'messages':
				return endpoint.includes('/messages')
			case 'interactions':
				return endpoint.includes('/interactions')
			case 'guilds':
				return endpoint.includes('/guilds')
			case 'channels':
				return endpoint.includes('/channels')
			default:
				return true
		}
	}

	/**
	 * Check if rate limit simulation is currently active (without consuming it)
	 */
	get isRateLimitSimulationActive(): boolean {
		return this._simulateRateLimit
	}

	/**
	 * Get the current rate limit configuration
	 */
	get rateLimitConfig(): {
		enabled: boolean
		retryAfter: number
		persistent: boolean
		scope: 'all' | 'messages' | 'interactions' | 'guilds' | 'channels'
		triggeredCount: number
	} {
		return {
			enabled: this._simulateRateLimit,
			retryAfter: this._rateLimitRetryAfter,
			persistent: this._rateLimitPersistent,
			scope: this._rateLimitScope,
			triggeredCount: this._rateLimitTriggeredCount
		}
	}

	// ============================================================================
	// Loop Protection (Phase 5R)
	// ============================================================================

	/**
	 * Enable or disable loop protection.
	 * When disabled, the server will not detect or prevent event loops.
	 */
	set loopProtectionEnabled(enabled: boolean) {
		this._loopProtectionEnabled = enabled
		if (!enabled) {
			// Clear any active cooldown when disabling
			this.loopDetected = false
			this.messageCreateTimestamps = []
			if (this.loopCooldownTimeout) {
				clearTimeout(this.loopCooldownTimeout)
				this.loopCooldownTimeout = null
			}
		}
		mockLogger.debug(`Session ${this.id}: Loop protection ${enabled ? 'enabled' : 'disabled'}`)
	}

	/**
	 * Check if loop protection is enabled
	 */
	get loopProtectionEnabled(): boolean {
		return this._loopProtectionEnabled
	}

	/**
	 * Check if a loop is currently detected (in cooldown)
	 */
	get isLoopDetected(): boolean {
		return this.loopDetected
	}

	// ============================================================================
	// Heartbeat Interval (Per-Session)
	// ============================================================================

	/**
	 * Set the heartbeat interval for new connections in this session.
	 * Set to null to use the global gateway default.
	 * Only affects NEW connections - existing connections keep their original interval.
	 *
	 * @param interval - Heartbeat interval in milliseconds (100-120000), or null for default
	 */
	set heartbeatInterval(interval: number | null) {
		if (interval !== null && (interval < 100 || interval > 120000)) {
			throw new Error('Heartbeat interval must be between 100 and 120000 ms')
		}
		this._heartbeatInterval = interval
		mockLogger.debug(`Session ${this.id}: Heartbeat interval set to ${interval ?? 'default'}`)
	}

	/**
	 * Get the heartbeat interval for this session.
	 * Returns null if using the global gateway default.
	 */
	get heartbeatInterval(): number | null {
		return this._heartbeatInterval
	}

	// ============================================================================
	// Permission Enforcement (Phase 3 - Permissions Admin UI)
	// ============================================================================

	/**
	 * Get the current permission enforcement level.
	 * Falls back to config value if not set at runtime.
	 */
	get permissionEnforcement(): 'none' | 'basic' | 'strict' {
		return this._permissionEnforcement ?? this.config?.permissionEnforcement ?? 'none'
	}

	/**
	 * Set the permission enforcement level at runtime.
	 * Set to null to use the config default.
	 */
	set permissionEnforcement(level: 'none' | 'basic' | 'strict' | null) {
		this._permissionEnforcement = level
		mockLogger.debug(`Session ${this.id}: Permission enforcement set to ${level ?? 'config default'}`)
	}

	/**
	 * Get all permission overrides
	 */
	getPermissionOverrides(): PermissionOverride[] {
		// Clean up expired overrides first
		const now = Date.now()
		for (const [id, override] of this._permissionOverrides) {
			if (override.expiresAt && override.expiresAt < now) {
				this._permissionOverrides.delete(id)
			}
		}
		return Array.from(this._permissionOverrides.values())
	}

	/**
	 * Get a specific permission override by ID
	 */
	getPermissionOverride(id: string): PermissionOverride | undefined {
		const override = this._permissionOverrides.get(id)
		if (override?.expiresAt && override.expiresAt < Date.now()) {
			this._permissionOverrides.delete(id)
			return undefined
		}
		return override
	}

	/**
	 * Add a new permission override
	 * @param override - The override to add (id will be generated if not provided)
	 * @returns The added override with generated ID
	 */
	addPermissionOverride(override: Omit<PermissionOverride, 'id' | 'createdAt'> & { id?: string }): PermissionOverride {
		const newOverride: PermissionOverride = {
			id: override.id ?? generateSnowflake(),
			userId: override.userId,
			channelId: override.channelId ?? null,
			guildId: override.guildId ?? null,
			permissions: override.permissions,
			expiresAt: override.expiresAt ?? null,
			createdAt: Date.now(),
			reason: override.reason
		}
		this._permissionOverrides.set(newOverride.id, newOverride)
		mockLogger.debug(`Session ${this.id}: Added permission override ${newOverride.id} for user ${newOverride.userId}`)
		return newOverride
	}

	/**
	 * Remove a permission override by ID
	 * @returns true if the override was removed, false if not found
	 */
	removePermissionOverride(id: string): boolean {
		const removed = this._permissionOverrides.delete(id)
		if (removed) {
			mockLogger.debug(`Session ${this.id}: Removed permission override ${id}`)
		}
		return removed
	}

	/**
	 * Clear all permission overrides
	 */
	clearPermissionOverrides(): void {
		const count = this._permissionOverrides.size
		this._permissionOverrides.clear()
		mockLogger.debug(`Session ${this.id}: Cleared ${count} permission overrides`)
	}

	/**
	 * Record a permission denied event (for Stage UI display)
	 */
	recordPermissionDenied(event: Omit<PermissionDeniedEvent, 'sessionId' | 'timestamp'>): PermissionDeniedEvent {
		const fullEvent: PermissionDeniedEvent = {
			...event,
			sessionId: this.id,
			timestamp: Date.now()
		}

		// Add to the beginning and trim to max size
		this._permissionDeniedEvents.unshift(fullEvent)
		if (this._permissionDeniedEvents.length > Session.MAX_PERMISSION_DENIED_EVENTS) {
			this._permissionDeniedEvents.pop()
		}

		// Notify Stage UI
		try {
			getStageBridge().onPermissionDenied(this.id, fullEvent)
		} catch {
			// Stage bridge may not be initialized in some contexts
		}

		return fullEvent
	}

	/**
	 * Get recent permission denied events
	 */
	getPermissionDeniedEvents(): PermissionDeniedEvent[] {
		return [...this._permissionDeniedEvents]
	}

	/**
	 * Clear permission denied events history
	 */
	clearPermissionDeniedEvents(): void {
		this._permissionDeniedEvents = []
	}

	/**
	 * Trigger loop protection circuit breaker.
	 * Logs a warning, notifies Stage UI, and starts cooldown period.
	 */
	private triggerLoopProtection(lastEventData: unknown): void {
		this.loopDetected = true
		this.messageCreateTimestamps = []

		// Extract info about the triggering message
		const messageData = lastEventData as Record<string, unknown>
		const author = messageData.author as Record<string, unknown> | undefined
		const authorId = author?.id as string | undefined
		const authorUsername = author?.username as string | undefined
		const content = ((messageData.content as string) ?? '').slice(0, 50)

		mockLogger.warn(
			`Event loop detected! ${Session.LOOP_THRESHOLD} MESSAGE_CREATE events in ${Session.LOOP_WINDOW_MS}ms. ` +
				`Dropping further events for ${Session.LOOP_COOLDOWN_MS / 1000}s. ` +
				`Last message from: ${authorUsername ?? authorId ?? 'unknown'}${content ? `, content: "${content}..."` : ''}`
		)

		// Notify Stage UI
		try {
			getStageBridge().onLoopDetected(this.id, {
				eventType: 'MESSAGE_CREATE',
				count: Session.LOOP_THRESHOLD,
				windowMs: Session.LOOP_WINDOW_MS,
				cooldownMs: Session.LOOP_COOLDOWN_MS,
				lastAuthorId: authorId ?? null,
				lastAuthorUsername: authorUsername ?? null,
				lastContent: content || null,
				timestamp: Date.now()
			})
		} catch {
			// Stage bridge may not be initialized in some contexts
		}

		// Auto-recover after cooldown
		this.loopCooldownTimeout = setTimeout(() => {
			this.loopDetected = false
			this.loopCooldownTimeout = null
			mockLogger.info(`Session ${this.id}: Loop protection cooldown ended`)
		}, Session.LOOP_COOLDOWN_MS)
	}

	// ============================================================================
	// Recording Export (Phase 4A)
	// ============================================================================

	/**
	 * Export the session as a recording object
	 * Returns a JSON-serializable recording with metadata and all actions
	 */
	exportRecording(): SessionRecording {
		const now = Date.now()

		return {
			version: 1,
			metadata: {
				sessionId: this.id,
				sessionName: this.name,
				startTime: this.createdAt,
				endTime: now,
				duration: now - this.createdAt,
				actionCount: this.recorder.length,
				botUser: {
					id: this.state.botUser.id,
					username: this.state.botUser.username
				},
				applicationId: this.state.applicationId,
				recordedAt: new Date(now).toISOString()
			},
			initialConfig: this.captureInitialConfig(),
			actions: this.recorder.getAll(),
			logs: this.logRecorder.length > 0 ? this.logRecorder.getAll() : undefined
		}
	}

	/**
	 * Save the recording to a JSON file
	 * @param filePath - Path to save the recording
	 */
	async saveRecording(filePath: string): Promise<void> {
		const fs = await import('node:fs/promises')
		const recording = this.exportRecording()
		await fs.writeFile(filePath, JSON.stringify(recording, null, 2))
		mockLogger.info(`Recording saved: ${filePath}`)
	}

	/**
	 * Capture current state as initial config for replay
	 */
	private captureInitialConfig(): SessionConfig {
		return {
			botUser: {
				id: this.state.botUser.id,
				username: this.state.botUser.username,
				discriminator: this.state.botUser.discriminator,
				globalName: this.state.botUser.globalName,
				avatar: this.state.botUser.avatar,
				bot: this.state.botUser.bot
			},
			applicationId: this.state.applicationId,
			guilds: Array.from(this.state.guilds.values()).map((g) => ({
				id: g.id,
				name: g.name,
				ownerId: g.ownerId,
				channels: Array.from(this.state.channels.values())
					.filter((c) => c.guildId === g.id)
					.map((c) => ({
						id: c.id,
						name: c.name,
						type: c.type,
						parentId: c.parentId
					}))
			})),
			maxActions: this.recorder.maxLength
		}
	}

	/**
	 * Reset session state (clear guilds, channels, etc. but keep bot user)
	 */
	reset(): void {
		this.state.reset()
		this.recorder.clear()
		this.voiceServers.clear()

		mockLogger.debug(`Session reset: ${this.id}`)
	}

	// ============================================================================
	// Auto-Archive (Phase 4D)
	// ============================================================================

	/**
	 * Start automatic thread archiving based on auto_archive_duration
	 * @param intervalMs - How often to check for inactive threads (default: 60000ms / 1 minute)
	 */
	startAutoArchive(intervalMs: number = 60000): void {
		if (this.autoArchiveInterval) {
			return // Already running
		}

		this.autoArchiveInterval = setInterval(async () => {
			await this.runAutoArchiveCheck()
		}, intervalMs)

		mockLogger.debug(`Session ${this.id}: Auto-archive started (interval: ${intervalMs}ms)`)
	}

	/**
	 * Stop automatic thread archiving
	 */
	stopAutoArchive(): void {
		if (this.autoArchiveInterval) {
			clearInterval(this.autoArchiveInterval)
			this.autoArchiveInterval = null
			mockLogger.debug(`Session ${this.id}: Auto-archive stopped`)
		}
	}

	/**
	 * Manually run auto-archive check and dispatch THREAD_UPDATE for archived threads
	 * @returns Array of archived thread IDs
	 */
	async runAutoArchiveCheck(): Promise<string[]> {
		const archivedIds = this.state.checkAutoArchiveThreads()

		// Dispatch THREAD_UPDATE for each archived thread
		for (const threadId of archivedIds) {
			const thread = this.state.getThread(threadId)
			if (thread) {
				const payload = buildThreadUpdatePayload({
					thread,
					sessionState: this.state,
					sequence: this.state.nextSequence()
				})
				await this.dispatch('THREAD_UPDATE', payload.d)

				mockLogger.debug(`Session ${this.id}: Thread ${threadId} auto-archived`)
			}
		}

		return archivedIds
	}

	// ============================================================================
	// User Management API (Phase 8)
	// ============================================================================

	/**
	 * Get the current acting user
	 */
	getCurrentUser(): MockUser {
		return this.state.currentUser
	}

	/**
	 * Set the current acting user by ID (switches to existing user)
	 * @returns The switched user, or undefined if not found
	 */
	setCurrentUser(userId: string): MockUser | undefined {
		return this.state.switchCurrentUser(userId)
	}

	/**
	 * Create a new user and optionally set as current
	 * @param config User configuration
	 * @param setAsCurrent Whether to set this user as the current user (default: false)
	 * @returns The created user
	 */
	createUser(
		config: { username: string; bot?: boolean; avatar?: string | null; status?: 'online' | 'offline' | 'idle' | 'dnd' },
		setAsCurrent = false
	): MockUser {
		const user = createMockUser({
			username: config.username,
			bot: config.bot ?? false,
			avatar: config.avatar ?? null,
			status: config.status
		})
		this.state.users.set(user.id, user)

		// Add to all guilds as member
		for (const guild of this.state.guilds.values()) {
			this.state.addMemberToGuild(guild.id, user.id, {
				roles: [],
				nick: null
			})
		}

		if (setAsCurrent) {
			this.state.currentUser = user
		}

		return user
	}

	/**
	 * Update a user's properties
	 * @param userId The user ID to update
	 * @param updates The properties to update
	 * @returns The updated user, or undefined if not found
	 */
	updateUser(
		userId: string,
		updates: Partial<{ username: string; avatar: string | null; status: 'online' | 'offline' | 'idle' | 'dnd' }>
	): MockUser | undefined {
		const user = this.state.users.get(userId)
		if (!user) return undefined

		const updated: MockUser = { ...user, ...updates }
		this.state.users.set(userId, updated)

		// If this is the current user, update that reference too
		if (this.state.currentUser.id === userId) {
			this.state.updateCurrentUser(updates)
		}

		return updated
	}

	/**
	 * Get all users in the session
	 */
	getUsers(): MockUser[] {
		return Array.from(this.state.users.values())
	}

	/**
	 * Get a specific user by ID
	 */
	getUser(userId: string): MockUser | undefined {
		return this.state.users.get(userId)
	}

	/**
	 * Perform an action as a specific user (temporary switch)
	 * Restores the original current user after the action completes
	 * @param userId The user ID to act as
	 * @param action The action to perform
	 * @returns The result of the action
	 */
	async asUser<T>(userId: string, action: () => T | Promise<T>): Promise<T> {
		const previousUser = this.state.currentUser
		const targetUser = this.state.switchCurrentUser(userId)
		if (!targetUser) {
			throw new Error(`User ${userId} not found`)
		}
		try {
			return await action()
		} finally {
			this.state.switchCurrentUser(previousUser.id)
		}
	}

	/**
	 * Send a message as a specific user
	 * @param userId The user ID to send as
	 * @param channelId The channel to send to
	 * @param content The message content
	 * @returns The created message
	 */
	async sendMessageAs(userId: string, channelId: string, content: string): Promise<MockMessage> {
		const user = this.state.users.get(userId)
		if (!user) throw new Error(`User ${userId} not found`)

		return this.dispatchMessage({
			channelId,
			content,
			author: { id: user.id, username: user.username }
		})
	}

	/**
	 * Invoke a command as a specific user
	 * @param userId The user ID to invoke as
	 * @param commandName The command name
	 * @param options Optional command options
	 * @returns The created interaction
	 */
	async invokeCommandAs(
		userId: string,
		commandName: string,
		options?: Record<string, string | number | boolean>
	): Promise<MockInteraction> {
		const user = this.state.users.get(userId)
		if (!user) throw new Error(`User ${userId} not found`)

		return this.dispatchSlashCommand({
			commandName,
			options,
			user: { id: user.id, username: user.username }
		})
	}

	/**
	 * Click a button as a specific user
	 * @param userId The user ID to click as
	 * @param messageId The message containing the button
	 * @param customId The button's custom ID
	 * @returns The created interaction
	 */
	async clickButtonAs(userId: string, messageId: string, customId: string): Promise<MockInteraction> {
		const user = this.state.users.get(userId)
		if (!user) throw new Error(`User ${userId} not found`)

		return this.dispatchButtonClick({
			messageId,
			customId,
			user: { id: user.id, username: user.username }
		})
	}

	/**
	 * End the session and clean up resources
	 */
	async end(): Promise<void> {
		if (this.ending) {
			return
		}

		this.ending = true
		mockLogger.debug(`Session ending: ${this.id}`)

		// Stop auto-archive interval
		this.stopAutoArchive()

		// Clear loop protection timeout
		if (this.loopCooldownTimeout) {
			clearTimeout(this.loopCooldownTimeout)
			this.loopCooldownTimeout = null
		}

		// Close all connections (will be implemented in future phases)
		for (const _conn of this.connections.values()) {
			// _conn.socket.close() - when WebSocket is implemented
		}
		this.connections.clear()

		// Clear voice server state
		this.voiceServers.clear()

		// Auto-save recording if in test mode and has actions
		// IMPORTANT: Must happen BEFORE state.reset() so captureInitialConfig() has data
		if (process.env.ROBO_MOCK_TEST_MODE === 'true' && this.recorder.length > 0) {
			try {
				const recording = this.exportRecording()
				saveRecording(this.id, recording)
				mockLogger.debug(`Auto-saved recording for session ${this.id}`)
			} catch (error) {
				mockLogger.warn(`Failed to auto-save recording for session ${this.id}: ${(error as Error).message}`)
			}
		}

		// Clear state using the reset method
		this.state.reset()

		// Clear recorded actions and logs
		this.recorder.clear()
		this.logRecorder.clear()

		mockLogger.debug(`Session ended: ${this.id}`)
	}
}
