/**
 * Intent Handling & Filtering
 * Maps Discord Gateway events to their required intents
 *
 * Note: GatewayIntentBits from discord-api-types are numbers, so we use number-based
 * bitwise operations throughout. The SessionConfig uses bigint for approvedPrivilegedIntents
 * to allow for future expansion, but we convert as needed.
 */
import { GatewayIntentBits } from 'discord-api-types/v10'

/**
 * Map each event to its required intent(s).
 * null = no intent required (always sent)
 * undefined = unknown event (allow by default)
 */
export const EVENT_INTENTS: Record<string, number | null> = {
	// No intent required - always sent
	READY: null,
	RESUMED: null,
	INTERACTION_CREATE: null,

	// GUILDS (1 << 0)
	GUILD_CREATE: GatewayIntentBits.Guilds,
	GUILD_UPDATE: GatewayIntentBits.Guilds,
	GUILD_DELETE: GatewayIntentBits.Guilds,
	GUILD_ROLE_CREATE: GatewayIntentBits.Guilds,
	GUILD_ROLE_UPDATE: GatewayIntentBits.Guilds,
	GUILD_ROLE_DELETE: GatewayIntentBits.Guilds,
	CHANNEL_CREATE: GatewayIntentBits.Guilds,
	CHANNEL_UPDATE: GatewayIntentBits.Guilds,
	CHANNEL_DELETE: GatewayIntentBits.Guilds,
	CHANNEL_PINS_UPDATE: GatewayIntentBits.Guilds,
	THREAD_CREATE: GatewayIntentBits.Guilds,
	THREAD_UPDATE: GatewayIntentBits.Guilds,
	THREAD_DELETE: GatewayIntentBits.Guilds,
	THREAD_LIST_SYNC: GatewayIntentBits.Guilds,
	STAGE_INSTANCE_CREATE: GatewayIntentBits.Guilds,
	STAGE_INSTANCE_UPDATE: GatewayIntentBits.Guilds,
	STAGE_INSTANCE_DELETE: GatewayIntentBits.Guilds,

	// GUILD_MEMBERS (1 << 1) - PRIVILEGED
	GUILD_MEMBER_ADD: GatewayIntentBits.GuildMembers,
	GUILD_MEMBER_UPDATE: GatewayIntentBits.GuildMembers,
	GUILD_MEMBER_REMOVE: GatewayIntentBits.GuildMembers,
	THREAD_MEMBERS_UPDATE: GatewayIntentBits.GuildMembers,

	// GUILD_MODERATION (1 << 2)
	GUILD_AUDIT_LOG_ENTRY_CREATE: GatewayIntentBits.GuildModeration,
	GUILD_BAN_ADD: GatewayIntentBits.GuildModeration,
	GUILD_BAN_REMOVE: GatewayIntentBits.GuildModeration,

	// GUILD_EMOJIS_AND_STICKERS (1 << 3)
	GUILD_EMOJIS_UPDATE: GatewayIntentBits.GuildEmojisAndStickers,
	GUILD_STICKERS_UPDATE: GatewayIntentBits.GuildEmojisAndStickers,

	// GUILD_INTEGRATIONS (1 << 4)
	GUILD_INTEGRATIONS_UPDATE: GatewayIntentBits.GuildIntegrations,
	INTEGRATION_CREATE: GatewayIntentBits.GuildIntegrations,
	INTEGRATION_UPDATE: GatewayIntentBits.GuildIntegrations,
	INTEGRATION_DELETE: GatewayIntentBits.GuildIntegrations,

	// GUILD_WEBHOOKS (1 << 5)
	WEBHOOKS_UPDATE: GatewayIntentBits.GuildWebhooks,

	// GUILD_INVITES (1 << 6)
	INVITE_CREATE: GatewayIntentBits.GuildInvites,
	INVITE_DELETE: GatewayIntentBits.GuildInvites,

	// GUILD_VOICE_STATES (1 << 7)
	VOICE_STATE_UPDATE: GatewayIntentBits.GuildVoiceStates,
	VOICE_CHANNEL_EFFECT_SEND: GatewayIntentBits.GuildVoiceStates,

	// GUILD_PRESENCES (1 << 8) - PRIVILEGED
	PRESENCE_UPDATE: GatewayIntentBits.GuildPresences,

	// GUILD_MESSAGES (1 << 9) - handled in GUILD_DM_EVENTS for context
	// MESSAGE_CREATE, MESSAGE_UPDATE, MESSAGE_DELETE, MESSAGE_DELETE_BULK

	// GUILD_MESSAGE_REACTIONS (1 << 10) - handled in GUILD_DM_EVENTS for context
	// MESSAGE_REACTION_ADD, MESSAGE_REACTION_REMOVE, etc.

	// GUILD_MESSAGE_TYPING (1 << 11) - handled in GUILD_DM_EVENTS for context
	// TYPING_START

	// MESSAGE_CONTENT (1 << 15) - PRIVILEGED
	// Doesn't filter events, but strips content/embeds/attachments/components/poll

	// GUILD_SCHEDULED_EVENTS (1 << 16)
	GUILD_SCHEDULED_EVENT_CREATE: GatewayIntentBits.GuildScheduledEvents,
	GUILD_SCHEDULED_EVENT_UPDATE: GatewayIntentBits.GuildScheduledEvents,
	GUILD_SCHEDULED_EVENT_DELETE: GatewayIntentBits.GuildScheduledEvents,
	GUILD_SCHEDULED_EVENT_USER_ADD: GatewayIntentBits.GuildScheduledEvents,
	GUILD_SCHEDULED_EVENT_USER_REMOVE: GatewayIntentBits.GuildScheduledEvents,

	// AUTO_MODERATION_CONFIGURATION (1 << 20)
	AUTO_MODERATION_RULE_CREATE: GatewayIntentBits.AutoModerationConfiguration,
	AUTO_MODERATION_RULE_UPDATE: GatewayIntentBits.AutoModerationConfiguration,
	AUTO_MODERATION_RULE_DELETE: GatewayIntentBits.AutoModerationConfiguration,

	// AUTO_MODERATION_EXECUTION (1 << 21)
	AUTO_MODERATION_ACTION_EXECUTION: GatewayIntentBits.AutoModerationExecution
}

/**
 * Events that have different intent requirements for guild vs DM context.
 * These require checking guild_id in the event data to determine which intent is needed.
 */
export const GUILD_DM_EVENTS: Record<string, { guild: number; dm: number }> = {
	MESSAGE_CREATE: {
		guild: GatewayIntentBits.GuildMessages,
		dm: GatewayIntentBits.DirectMessages
	},
	MESSAGE_UPDATE: {
		guild: GatewayIntentBits.GuildMessages,
		dm: GatewayIntentBits.DirectMessages
	},
	MESSAGE_DELETE: {
		guild: GatewayIntentBits.GuildMessages,
		dm: GatewayIntentBits.DirectMessages
	},
	MESSAGE_DELETE_BULK: {
		guild: GatewayIntentBits.GuildMessages,
		dm: GatewayIntentBits.DirectMessages
	},
	MESSAGE_REACTION_ADD: {
		guild: GatewayIntentBits.GuildMessageReactions,
		dm: GatewayIntentBits.DirectMessageReactions
	},
	MESSAGE_REACTION_REMOVE: {
		guild: GatewayIntentBits.GuildMessageReactions,
		dm: GatewayIntentBits.DirectMessageReactions
	},
	MESSAGE_REACTION_REMOVE_ALL: {
		guild: GatewayIntentBits.GuildMessageReactions,
		dm: GatewayIntentBits.DirectMessageReactions
	},
	MESSAGE_REACTION_REMOVE_EMOJI: {
		guild: GatewayIntentBits.GuildMessageReactions,
		dm: GatewayIntentBits.DirectMessageReactions
	},
	TYPING_START: {
		guild: GatewayIntentBits.GuildMessageTyping,
		dm: GatewayIntentBits.DirectMessageTyping
	},
	MESSAGE_POLL_VOTE_ADD: {
		guild: GatewayIntentBits.GuildMessagePolls,
		dm: GatewayIntentBits.DirectMessagePolls
	},
	MESSAGE_POLL_VOTE_REMOVE: {
		guild: GatewayIntentBits.GuildMessagePolls,
		dm: GatewayIntentBits.DirectMessagePolls
	}
}

/**
 * Privileged intents that require special approval from Discord.
 * Used for validating if a bot is allowed to use these intents.
 */
export const PRIVILEGED_INTENTS: number =
	GatewayIntentBits.GuildMembers | GatewayIntentBits.GuildPresences | GatewayIntentBits.MessageContent

/**
 * Default approved privileged intents for testing.
 * All privileged intents are approved by default for ease of testing.
 * Stored as bigint for SessionConfig compatibility.
 */
export const DEFAULT_APPROVED_PRIVILEGED_INTENTS: bigint = BigInt(PRIVILEGED_INTENTS)

/**
 * Gateway close codes related to intents.
 */
export const INTENT_CLOSE_CODES = {
	/** Used when the bot declares a privileged intent that isn't approved */
	DISALLOWED_INTENTS: 4014
} as const

/**
 * Check if an event should be dispatched based on the connection's declared intents.
 *
 * @param eventName - The Gateway event name (e.g., 'MESSAGE_CREATE')
 * @param eventData - The event payload data
 * @param connectionIntents - The bot's declared intents as a bitfield
 * @returns true if the event should be dispatched, false otherwise
 */
export function shouldDispatchEvent(eventName: string, eventData: unknown, connectionIntents: number): boolean {
	// Check guild vs DM variant first
	const guildDm = GUILD_DM_EVENTS[eventName]
	if (guildDm) {
		const data = eventData as Record<string, unknown>
		const isGuild = 'guild_id' in data && data.guild_id != null
		const requiredIntent = isGuild ? guildDm.guild : guildDm.dm
		return (connectionIntents & requiredIntent) !== 0
	}

	// Check standard mapping
	const requiredIntent = EVENT_INTENTS[eventName]

	// No intent required - always dispatch
	if (requiredIntent === null) {
		return true
	}

	// Unknown event - allow by default
	if (requiredIntent === undefined) {
		return true
	}

	// Check if connection has the required intent
	return (connectionIntents & requiredIntent) !== 0
}

/**
 * Strip message content fields when MESSAGE_CONTENT intent is missing.
 * Returns the original message if:
 * - Bot has MESSAGE_CONTENT intent
 * - Message is a DM
 * - Message is from the bot itself
 * - Message mentions the bot
 *
 * @param message - The message object to potentially strip
 * @param connectionIntents - The bot's declared intents as a bitfield
 * @param botId - The bot's user ID
 * @returns The message with content fields stripped if needed
 */
export function stripMessageContent<T extends Record<string, unknown>>(
	message: T,
	connectionIntents: number,
	botId: string
): T {
	// Check if bot has MESSAGE_CONTENT intent
	const hasMessageContent = (connectionIntents & GatewayIntentBits.MessageContent) !== 0

	if (hasMessageContent) {
		return message // Has intent, return full message
	}

	// Check exemptions
	const isDM = !message.guild_id
	const isFromBot = (message.author as { id?: string })?.id === botId

	// Check if message mentions the bot
	const mentions = message.mentions as Array<{ id?: string }> | undefined
	const mentionsBot = mentions?.some((u) => u.id === botId) ?? false

	if (isDM || isFromBot || mentionsBot) {
		return message // Exempt, return full message
	}

	// Strip content fields
	return {
		...message,
		content: '',
		embeds: [],
		attachments: [],
		components: [],
		poll: undefined
	}
}

/**
 * Check if the declared intents include any privileged intents that aren't approved.
 *
 * @param declaredIntents - The intents declared in IDENTIFY
 * @param approvedPrivileged - The approved privileged intents (bigint from SessionConfig)
 * @returns true if all privileged intents are approved, false otherwise
 */
export function hasApprovedPrivilegedIntents(declaredIntents: number, approvedPrivileged: bigint): boolean {
	// Extract privileged intents from what was declared (using number ops)
	const declaredPrivileged = declaredIntents & PRIVILEGED_INTENTS

	// Convert to bigint for comparison with approved (which is bigint from SessionConfig)
	const declaredPrivilegedBigInt = BigInt(declaredPrivileged)
	const approved = declaredPrivilegedBigInt & approvedPrivileged

	// All declared privileged intents must be approved
	return declaredPrivilegedBigInt === approved
}

/**
 * Map intent bit value to human-readable name.
 */
const INTENT_NAMES: Record<number, string> = {
	[GatewayIntentBits.Guilds]: 'Guilds',
	[GatewayIntentBits.GuildMembers]: 'GuildMembers',
	[GatewayIntentBits.GuildModeration]: 'GuildModeration',
	[GatewayIntentBits.GuildEmojisAndStickers]: 'GuildEmojisAndStickers',
	[GatewayIntentBits.GuildIntegrations]: 'GuildIntegrations',
	[GatewayIntentBits.GuildWebhooks]: 'GuildWebhooks',
	[GatewayIntentBits.GuildInvites]: 'GuildInvites',
	[GatewayIntentBits.GuildVoiceStates]: 'GuildVoiceStates',
	[GatewayIntentBits.GuildPresences]: 'GuildPresences',
	[GatewayIntentBits.GuildMessages]: 'GuildMessages',
	[GatewayIntentBits.GuildMessageReactions]: 'GuildMessageReactions',
	[GatewayIntentBits.GuildMessageTyping]: 'GuildMessageTyping',
	[GatewayIntentBits.DirectMessages]: 'DirectMessages',
	[GatewayIntentBits.DirectMessageReactions]: 'DirectMessageReactions',
	[GatewayIntentBits.DirectMessageTyping]: 'DirectMessageTyping',
	[GatewayIntentBits.MessageContent]: 'MessageContent',
	[GatewayIntentBits.GuildScheduledEvents]: 'GuildScheduledEvents',
	[GatewayIntentBits.AutoModerationConfiguration]: 'AutoModerationConfiguration',
	[GatewayIntentBits.AutoModerationExecution]: 'AutoModerationExecution',
	[GatewayIntentBits.GuildMessagePolls]: 'GuildMessagePolls',
	[GatewayIntentBits.DirectMessagePolls]: 'DirectMessagePolls'
}

/**
 * Get the human-readable name for an intent bit value.
 *
 * @param intent - The intent bit value
 * @returns Human-readable intent name
 */
function getIntentName(intent: number): string {
	return INTENT_NAMES[intent] || `Intent(${intent})`
}

/**
 * Get the human-readable intent name required for an event.
 * Returns null if the event doesn't require any intent.
 *
 * @param eventName - The Gateway event name (e.g., 'MESSAGE_CREATE')
 * @param isGuild - Whether this is a guild event (vs DM)
 * @returns Human-readable intent name, or null if no intent required
 */
export function getRequiredIntentName(eventName: string, isGuild: boolean): string | null {
	// Check guild/DM variants first
	const guildDm = GUILD_DM_EVENTS[eventName]
	if (guildDm) {
		const intent = isGuild ? guildDm.guild : guildDm.dm
		return getIntentName(intent)
	}

	// Check standard mapping
	const intent = EVENT_INTENTS[eventName]
	if (intent === null || intent === undefined) {
		return null
	}

	return getIntentName(intent)
}
