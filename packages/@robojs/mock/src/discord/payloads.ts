import { GatewayOpcodes, ChannelType, GuildDefaultMessageNotifications, GuildExplicitContentFilter, GuildMFALevel, GuildNSFWLevel, GuildPremiumTier, GuildVerificationLevel, MessageType, InteractionType, ApplicationCommandType, ComponentType } from 'discord-api-types/v10'
import type { APIUser, APIUnavailableGuild, APIChannel, APIDMChannel, APIRole, APIGuildMember, Snowflake, APIMessage, APIEmbed, APIAttachment, APIMessageInteractionMetadata, APIMessageSnapshot, APIOverwrite, APIRoleTags } from 'discord-api-types/v10'
import { DEFAULT_HEARTBEAT_INTERVAL, GATEWAY_VERSION } from './opcodes.js'
import type { MockUser, MockGuild, MockChannel, MockMessage, MockInteraction, SessionState, MockMessageSnapshot, MockThread, MockThreadMember, MockForumChannel, MockForumThread, MockForumTag, MockSticker, MockWebhook, MockEmoji, MockRole, MockGuildMember, MockChannelOverwrite, MockApplicationCommand, MockInvite, MockScheduledEvent, MockAutoModRule, MockAutoModAction } from '../types/index.js'
import { AutoModerationTriggerType } from '../types/index.js'
import { generateSnowflake } from '../utils/snowflake.js'

/**
 * Gateway payload structure
 */
export interface GatewayPayload {
	op: number
	d: unknown
	s?: number | null
	t?: string | null
}

/**
 * HELLO payload data
 */
export interface HelloPayloadData {
	heartbeat_interval: number
}

/**
 * IDENTIFY payload data (op 2)
 * Sent by client to authenticate with the Gateway
 */
export interface IdentifyPayloadData {
	token: string
	intents: number
	properties: {
		os: string
		browser: string
		device: string
	}
	compress?: boolean
	large_threshold?: number
	shard?: [number, number]
	presence?: unknown
}

/**
 * RESUME payload data (op 6)
 * Sent by client to resume a dropped Gateway connection
 */
export interface ResumePayloadData {
	token: string
	session_id: string
	seq: number
}

/**
 * Validate that data is a valid RESUME payload
 */
export function isValidResumePayload(data: unknown): data is ResumePayloadData {
	if (!data || typeof data !== 'object') return false
	const d = data as Record<string, unknown>
	return typeof d.token === 'string' && typeof d.session_id === 'string' && typeof d.seq === 'number'
}

/**
 * Build a RESUMED payload (op 0, t: RESUMED)
 * Sent by server after successfully resuming a connection
 */
export function buildResumedPayload(): GatewayPayload {
	return { op: 0, s: null, t: 'RESUMED', d: null }
}

/**
 * Build an INVALID_SESSION payload (op 9)
 * Sent by server when a session can no longer be resumed
 *
 * @param resumable - Whether the session can be reconnected via a new IDENTIFY (true) or not (false)
 */
export function buildInvalidSessionPayload(resumable: boolean): GatewayPayload {
	return { op: 9, d: resumable, s: null, t: null }
}

/**
 * Validate that data is a valid IDENTIFY payload
 */
export function isValidIdentifyPayload(data: unknown): data is IdentifyPayloadData {
	if (!data || typeof data !== 'object') {
		return false
	}

	const d = data as Record<string, unknown>

	// Required: token (string)
	if (typeof d.token !== 'string' || d.token.length === 0) {
		return false
	}

	// Required: intents (number)
	if (typeof d.intents !== 'number') {
		return false
	}

	// Required: properties (object with os, browser, device)
	if (!d.properties || typeof d.properties !== 'object') {
		return false
	}

	const props = d.properties as Record<string, unknown>
	if (typeof props.os !== 'string' || typeof props.browser !== 'string' || typeof props.device !== 'string') {
		return false
	}

	return true
}

/**
 * Build a HELLO payload (op 10)
 * Sent by server immediately after WebSocket connection established
 */
export function buildHelloPayload(heartbeatInterval: number = DEFAULT_HEARTBEAT_INTERVAL): GatewayPayload {
	return {
		op: GatewayOpcodes.Hello,
		d: {
			heartbeat_interval: heartbeatInterval
		}
	}
}

/**
 * Build a HEARTBEAT_ACK payload (op 11)
 * Sent by server in response to client HEARTBEAT
 */
export function buildHeartbeatAckPayload(): GatewayPayload {
	return {
		op: GatewayOpcodes.HeartbeatAck,
		d: null
	}
}

// ============================================================================
// Type Conversions
// ============================================================================

/**
 * Convert MockUser to Discord APIUser format
 */
export function mockUserToAPIUser(user: MockUser): APIUser {
	return {
		id: user.id,
		username: user.username,
		discriminator: user.discriminator,
		global_name: user.globalName,
		avatar: user.avatar,
		bot: user.bot || undefined
	}
}

/**
 * Convert MockRole to Discord APIRole format
 */
export function mockRoleToAPIRole(role: MockRole): APIRole {
	const apiRole: APIRole = {
		id: role.id,
		name: role.name,
		color: role.color,
		hoist: role.hoist,
		position: role.position,
		permissions: role.permissions,
		managed: role.managed,
		mentionable: role.mentionable,
		flags: role.flags as APIRole['flags']
	}

	// Add optional fields
	if (role.icon !== undefined) {
		apiRole.icon = role.icon
	}
	if (role.unicodeEmoji !== undefined) {
		apiRole.unicode_emoji = role.unicodeEmoji
	}
	if (role.tags) {
		const tags: APIRoleTags = {}
		if (role.tags.bot_id !== undefined) tags.bot_id = role.tags.bot_id
		if (role.tags.integration_id !== undefined) tags.integration_id = role.tags.integration_id
		if (role.tags.premium_subscriber !== undefined) tags.premium_subscriber = role.tags.premium_subscriber
		if (role.tags.subscription_listing_id !== undefined) tags.subscription_listing_id = role.tags.subscription_listing_id
		if (role.tags.available_for_purchase !== undefined) tags.available_for_purchase = role.tags.available_for_purchase
		if (role.tags.guild_connections !== undefined) tags.guild_connections = role.tags.guild_connections
		apiRole.tags = tags
	}

	return apiRole
}

/**
 * Convert MockGuildMember to Discord APIGuildMember format
 */
export function mockGuildMemberToAPIMember(member: MockGuildMember, user: MockUser): APIGuildMember {
	const apiMember: APIGuildMember = {
		user: mockUserToAPIUser(user),
		roles: [...member.roles],
		joined_at: member.joinedAt,
		deaf: member.deaf,
		mute: member.mute,
		flags: member.flags as APIGuildMember['flags']
	}

	// Add optional fields
	if (member.nick !== undefined && member.nick !== null) {
		apiMember.nick = member.nick
	}
	if (member.avatar !== undefined && member.avatar !== null) {
		apiMember.avatar = member.avatar
	}
	if (member.premiumSince !== undefined && member.premiumSince !== null) {
		apiMember.premium_since = member.premiumSince
	}
	if (member.pending !== undefined) {
		apiMember.pending = member.pending
	}
	if (member.communicationDisabledUntil !== undefined && member.communicationDisabledUntil !== null) {
		apiMember.communication_disabled_until = member.communicationDisabledUntil
	}

	return apiMember
}

/**
 * Convert MockChannelOverwrite to Discord APIOverwrite format
 */
export function mockOverwriteToAPIOverwrite(overwrite: MockChannelOverwrite): APIOverwrite {
	return {
		id: overwrite.id,
		type: overwrite.type,
		allow: overwrite.allow,
		deny: overwrite.deny
	}
}

/**
 * Options for converting commands to API format
 */
export interface CommandToAPIOptions {
	/** Include full localization dictionaries (default: true for backwards compatibility) */
	withLocalizations?: boolean
}

/**
 * Convert MockApplicationCommand to Discord API format
 * @see https://discord.com/developers/docs/interactions/application-commands#application-command-object
 */
export function mockCommandToAPICommand(command: MockApplicationCommand, options?: CommandToAPIOptions): Record<string, unknown> {
	const withLocalizations = options?.withLocalizations ?? true

	const apiCommand: Record<string, unknown> = {
		id: command.id,
		type: command.type,
		application_id: command.application_id,
		name: command.name,
		description: command.description,
		default_member_permissions: command.default_member_permissions,
		version: command.version
	}

	// Add optional fields only if defined
	if (command.guild_id !== undefined) {
		apiCommand.guild_id = command.guild_id
	}

	// Include localizations based on withLocalizations parameter
	// When false, Discord returns name_localized/description_localized instead
	// Since we don't track request locale, we just omit localizations when false
	if (withLocalizations) {
		if (command.name_localizations !== undefined) {
			apiCommand.name_localizations = command.name_localizations
		}
		if (command.description_localizations !== undefined) {
			apiCommand.description_localizations = command.description_localizations
		}
	}

	if (command.options !== undefined && command.options.length > 0) {
		apiCommand.options = command.options
	}
	if (command.dm_permission !== undefined) {
		apiCommand.dm_permission = command.dm_permission
	}
	if (command.nsfw !== undefined) {
		apiCommand.nsfw = command.nsfw
	}
	if (command.integration_types !== undefined) {
		apiCommand.integration_types = command.integration_types
	}
	if (command.contexts !== undefined) {
		apiCommand.contexts = command.contexts
	}
	// Entry point command handler
	if (command.handler !== undefined) {
		apiCommand.handler = command.handler
	}

	return apiCommand
}

/**
 * Convert guild ID to APIUnavailableGuild format
 * Guilds are sent as unavailable in READY, then become available via GUILD_CREATE
 */
export function mockGuildToUnavailable(guildId: Snowflake): APIUnavailableGuild {
	return {
		id: guildId,
		unavailable: true
	}
}

/**
 * Convert MockSticker to Discord API sticker format
 */
export function mockStickerToAPISticker(sticker: MockSticker): {
	id: Snowflake
	pack_id?: Snowflake
	name: string
	description: string | null
	tags: string
	type: number
	format_type: number
	available: boolean
	guild_id?: Snowflake
	user?: APIUser
	sort_value?: number
} {
	return {
		id: sticker.id,
		pack_id: sticker.pack_id,
		name: sticker.name,
		description: sticker.description,
		tags: sticker.tags,
		type: sticker.type,
		format_type: sticker.format_type,
		available: sticker.available,
		guild_id: sticker.guild_id,
		user: sticker.user ? mockUserToAPIUser(sticker.user) : undefined,
		sort_value: sticker.sort_value
	}
}

/**
 * Convert MockEmoji to Discord API emoji format
 * @see https://discord.com/developers/docs/resources/emoji#emoji-object
 */
export function mockEmojiToAPIEmoji(emoji: MockEmoji): {
	id: Snowflake | null
	name: string | null
	roles?: Snowflake[]
	user?: APIUser
	require_colons?: boolean
	managed?: boolean
	animated?: boolean
	available?: boolean
} {
	// Build the result object, only including defined optional fields
	const result: {
		id: Snowflake | null
		name: string | null
		roles?: Snowflake[]
		user?: APIUser
		require_colons?: boolean
		managed?: boolean
		animated?: boolean
		available?: boolean
	} = {
		id: emoji.id,
		name: emoji.name
	}

	// Include roles if present (for guild emojis, always include as array)
	if (emoji.roles !== undefined) {
		result.roles = emoji.roles
	}

	// Include user if present (only returned with MANAGE_EXPRESSIONS permission)
	if (emoji.user) {
		result.user = mockUserToAPIUser(emoji.user)
	}

	// Include optional boolean fields if defined
	if (emoji.require_colons !== undefined) {
		result.require_colons = emoji.require_colons
	}
	if (emoji.managed !== undefined) {
		result.managed = emoji.managed
	}
	if (emoji.animated !== undefined) {
		result.animated = emoji.animated
	}
	if (emoji.available !== undefined) {
		result.available = emoji.available
	}

	return result
}

/**
 * Convert MockWebhook to Discord API webhook format
 * @param webhook The webhook to convert
 * @param includeToken Whether to include the token in the response (only for creator or token-based access)
 */
export function mockWebhookToAPIWebhook(
	webhook: MockWebhook,
	includeToken: boolean = false
): {
	id: Snowflake
	type: number
	guild_id?: Snowflake
	channel_id: Snowflake
	user?: APIUser
	name: string | null
	avatar: string | null
	token?: string
	application_id: Snowflake | null
	source_guild?: { id: Snowflake; name: string; icon: string | null }
	source_channel?: { id: Snowflake; name: string }
	url?: string
} {
	const result: {
		id: Snowflake
		type: number
		guild_id?: Snowflake
		channel_id: Snowflake
		user?: APIUser
		name: string | null
		avatar: string | null
		token?: string
		application_id: Snowflake | null
		source_guild?: { id: Snowflake; name: string; icon: string | null }
		source_channel?: { id: Snowflake; name: string }
		url?: string
	} = {
		id: webhook.id,
		type: webhook.type,
		channel_id: webhook.channel_id,
		name: webhook.name,
		avatar: webhook.avatar,
		application_id: webhook.application_id
	}

	if (webhook.guild_id) {
		result.guild_id = webhook.guild_id
	}

	if (webhook.user) {
		result.user = mockUserToAPIUser(webhook.user)
	}

	if (includeToken && webhook.token) {
		result.token = webhook.token
		// Include URL when token is present
		result.url = `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`
	}

	if (webhook.source_guild) {
		result.source_guild = webhook.source_guild
	}

	if (webhook.source_channel) {
		result.source_channel = webhook.source_channel
	}

	return result
}

// ============================================================================
// READY Payload
// ============================================================================

/**
 * Options for building a READY payload
 */
export interface ReadyPayloadOptions {
	sessionState: SessionState
	connectionSessionId: string
	gatewayUrl?: string
	/**
	 * Per-connection bot user identity (overrides sessionState.botUser)
	 * Used for multi-bot sessions where each connection has its own identity
	 */
	connectionBotUser?: MockUser
}

/**
 * READY payload data structure
 */
export interface ReadyPayloadData {
	v: number
	user: APIUser
	guilds: APIUnavailableGuild[]
	session_id: string
	resume_gateway_url: string
	application: {
		id: Snowflake
		flags: number
	}
}

/**
 * Build a READY payload (op 0, t: "READY")
 * Sent by server after successful IDENTIFY
 */
export function buildReadyPayload(options: ReadyPayloadOptions): GatewayPayload {
	const { sessionState, connectionSessionId, gatewayUrl = 'ws://localhost:8765', connectionBotUser } = options

	// Convert bot user to API format (prefer per-connection bot user over session-level)
	const user = mockUserToAPIUser(connectionBotUser ?? sessionState.botUser)

	// Convert all guilds to unavailable format
	const guilds: APIUnavailableGuild[] = Array.from(sessionState.guilds.keys()).map(mockGuildToUnavailable)

	const data: ReadyPayloadData = {
		v: parseInt(GATEWAY_VERSION, 10),
		user,
		guilds,
		session_id: connectionSessionId,
		resume_gateway_url: gatewayUrl,
		application: {
			id: sessionState.applicationId,
			flags: 0
		}
	}

	return {
		op: GatewayOpcodes.Dispatch,
		s: 1,
		t: 'READY',
		d: data
	}
}

// ============================================================================
// GUILD_CREATE Payload
// ============================================================================

/**
 * Options for building a GUILD_CREATE payload
 */
export interface GuildCreatePayloadOptions {
	guild: MockGuild
	sessionState: SessionState
	sequence: number
}

/**
 * Convert MockChannel to Discord APIChannel format
 */
export function mockChannelToAPIChannel(channel: MockChannel): APIChannel {
	// Handle forum/media channels
	if (channel.type === 15 || channel.type === 16) {
		return mockForumChannelToAPIChannel(channel as MockForumChannel)
	}

	const result: APIChannel = {
		id: channel.id,
		type: channel.type as ChannelType,
		guild_id: channel.guildId,
		name: channel.name,
		position: channel.position ?? 0,
		permission_overwrites: channel.permissionOverwrites
			? channel.permissionOverwrites.map((ow) => ({
					id: ow.id,
					type: ow.type,
					allow: ow.allow,
					deny: ow.deny
				}))
			: [],
		nsfw: channel.nsfw ?? false,
		topic: channel.topic ?? null,
		last_message_id: null,
		rate_limit_per_user: channel.rateLimitPerUser ?? 0,
		parent_id: channel.parentId ?? null
	} as APIChannel

	// Add text channel specific fields
	if (channel.type === 0) {
		// GuildText
		;(result as any).default_auto_archive_duration = channel.defaultAutoArchiveDuration ?? 1440
	}

	// Add voice channel specific fields
	if (channel.type === 2) {
		// GuildVoice
		;(result as any).bitrate = channel.bitrate ?? 64000
		;(result as any).user_limit = channel.userLimit ?? 0
		;(result as any).status = channel.status ?? null
		;(result as any).rtc_region = channel.rtcRegion ?? null
		;(result as any).video_quality_mode = channel.videoQualityMode ?? null
	}

	// Add stage channel specific fields (type 13 = GuildStageVoice)
	if (channel.type === 13) {
		// Stage channels are voice-based and need bitrate for Discord.js isVoiceBased()
		;(result as any).bitrate = channel.bitrate ?? 64000
		;(result as any).user_limit = channel.userLimit ?? 0
		;(result as any).rtc_region = channel.rtcRegion ?? null
	}

	return result
}

/**
 * Convert MockForumChannel to Discord APIChannel format
 */
export function mockForumChannelToAPIChannel(channel: MockForumChannel): APIChannel {
	return {
		id: channel.id,
		type: channel.type as ChannelType,
		guild_id: channel.guildId,
		name: channel.name,
		position: 0,
		permission_overwrites: [],
		nsfw: false,
		topic: channel.topic ?? null,
		last_message_id: null,
		rate_limit_per_user: 0,
		parent_id: channel.parentId ?? null,
		// Forum-specific fields
		default_auto_archive_duration: channel.default_auto_archive_duration,
		default_thread_rate_limit_per_user: channel.default_thread_rate_limit_per_user,
		default_sort_order: channel.default_sort_order,
		default_forum_layout: channel.default_forum_layout,
		default_reaction_emoji: channel.default_reaction_emoji,
		available_tags: channel.available_tags.map(mockForumTagToAPIForumTag),
		template: channel.template
	} as APIChannel
}

/**
 * Convert MockForumTag to Discord API forum tag format
 */
export function mockForumTagToAPIForumTag(tag: MockForumTag): {
	id: Snowflake
	name: string
	moderated: boolean
	emoji_id: Snowflake | null
	emoji_name: string | null
} {
	return {
		id: tag.id,
		name: tag.name,
		moderated: tag.moderated,
		emoji_id: tag.emoji_id,
		emoji_name: tag.emoji_name
	}
}

/**
 * Convert MockForumThread to Discord API channel format with applied_tags
 * @param thread The forum thread
 * @param message Optional initial message to include in response
 * @param author Optional author for the message (required if message is provided)
 */
export function mockForumThreadToAPIChannel(
	thread: MockForumThread,
	message?: MockMessage,
	author?: MockUser
): APIChannel {
	const baseChannel = {
		id: thread.id,
		type: thread.type as ChannelType,
		guild_id: thread.guildId,
		name: thread.name,
		parent_id: thread.parentId,
		owner_id: thread.ownerId,
		message_count: thread.messageCount,
		member_count: thread.memberCount,
		total_message_sent: thread.totalMessageSent,
		last_message_id: thread.lastMessageId ?? null,
		thread_metadata: {
			archived: thread.threadMetadata.archived,
			auto_archive_duration: thread.threadMetadata.auto_archive_duration,
			archive_timestamp: thread.threadMetadata.archive_timestamp,
			locked: thread.threadMetadata.locked,
			invitable: thread.threadMetadata.invitable,
			create_timestamp: thread.threadMetadata.create_timestamp
		},
		rate_limit_per_user: 0,
		position: 0,
		permission_overwrites: [],
		nsfw: false,
		// Forum thread specific
		applied_tags: thread.applied_tags ?? []
	}

	// If message is provided, include it in the response (for forum post creation)
	if (message && author) {
		return {
			...baseChannel,
			message: mockMessageToAPIMessage(message, author)
		} as APIChannel
	}

	return baseChannel as APIChannel
}

/**
 * Convert MockChannel (DM type) to Discord APIDMChannel format
 */
export function mockDMChannelToAPIDMChannel(channel: MockChannel, recipient: MockUser): APIDMChannel {
	return {
		id: channel.id,
		type: ChannelType.DM,
		name: null, // DM channels have null name
		recipients: [mockUserToAPIUser(recipient)],
		last_message_id: null
	}
}

/**
 * Build the @everyone role for a guild
 */
export function buildEveryoneRole(guildId: Snowflake): APIRole {
	return {
		id: guildId, // @everyone role has same ID as guild
		name: '@everyone',
		color: 0,
		hoist: false,
		position: 0,
		permissions: '1071698660929', // Default permissions
		managed: false,
		mentionable: false,
		flags: 0 as APIRole['flags']
	}
}

/**
 * Build a guild member object for a user
 */
export function buildGuildMember(user: MockUser, joinedAt: string): APIGuildMember {
	return {
		user: mockUserToAPIUser(user),
		roles: [],
		joined_at: joinedAt,
		deaf: false,
		mute: false,
		flags: 0 as APIGuildMember['flags']
	}
}

/**
 * Build a GUILD_CREATE payload (op 0, t: "GUILD_CREATE")
 * Sent by server after READY to make guilds "available"
 */
export function buildGuildCreatePayload(options: GuildCreatePayloadOptions): GatewayPayload {
	const { guild, sessionState, sequence } = options
	const joinedAt = new Date().toISOString()

	// Get channels for this guild (excluding threads)
	const channels: APIChannel[] = guild.channels
		.map((channelId) => sessionState.channels.get(channelId))
		.filter((channel): channel is MockChannel => channel !== undefined)
		.filter((channel) => channel.type !== 10 && channel.type !== 11 && channel.type !== 12) // Exclude threads
		.map(mockChannelToAPIChannel)

	// Get active threads for this guild (include member field if bot is a member)
	const threads: APIChannel[] = guild.channels
		.map((channelId) => sessionState.channels.get(channelId))
		.filter((channel): channel is MockThread => {
			return channel !== undefined && (channel.type === 10 || channel.type === 11 || channel.type === 12)
		})
		.filter((thread) => !thread.threadMetadata?.archived) // Only active threads
		.map((thread) => {
			// Check if bot is a member of this thread
			const botMember = sessionState.getThreadMember(thread.id, sessionState.botUser.id)
			return mockThreadToAPIChannel(thread, botMember ?? undefined)
		})

	// Build roles from state
	// If roles exist in the state's roles Map, use them; otherwise fall back to @everyone only
	const roles: APIRole[] = guild.roles
		.map((roleId) => sessionState.roles.get(roleId))
		.filter((role): role is MockRole => role !== undefined)
		.map(mockRoleToAPIRole)
	// Ensure at least @everyone exists
	if (roles.length === 0) {
		roles.push(buildEveryoneRole(guild.id))
	}

	// Build members from state
	// If guildMembers exist in state, use them; otherwise fall back to simple members
	const members: APIGuildMember[] = []
	for (const memberId of guild.members) {
		const user = sessionState.users.get(memberId)
		if (!user) continue

		// Try to get detailed member data from guildMembers Map
		const guildMember = sessionState.guildMembers.get(`${guild.id}:${memberId}`)
		if (guildMember) {
			members.push(mockGuildMemberToAPIMember(guildMember, user))
		} else {
			// Fallback for backward compatibility
			members.push(buildGuildMember(user, joinedAt))
		}
	}
	// Ensure bot is in the member list
	if (!members.some((m) => m.user?.id === sessionState.botUser.id)) {
		members.push(buildGuildMember(sessionState.botUser, joinedAt))
	}

	const data = {
		// Core guild fields
		id: guild.id,
		name: guild.name,
		icon: guild.icon ?? null,
		icon_hash: null,
		splash: guild.splash ?? null,
		discovery_splash: guild.discoverySplash ?? null,
		owner_id: guild.ownerId,
		afk_channel_id: guild.afkChannelId ?? null,
		afk_timeout: guild.afkTimeout ?? 300,
		widget_enabled: false,
		widget_channel_id: null,
		verification_level: guild.verificationLevel ?? GuildVerificationLevel.None,
		default_message_notifications: guild.defaultMessageNotifications ?? GuildDefaultMessageNotifications.AllMessages,
		explicit_content_filter: guild.explicitContentFilter ?? GuildExplicitContentFilter.Disabled,
		roles,
		emojis: guild.emojis
			.map((id) => sessionState.emojis.get(id))
			.filter((e): e is MockEmoji => e !== undefined)
			.map(mockEmojiToAPIEmoji),
		features: guild.features ?? [],
		mfa_level: guild.mfaLevel ?? GuildMFALevel.None,
		application_id: null,
		system_channel_id: guild.systemChannelId ?? null,
		system_channel_flags: guild.systemChannelFlags ?? 0,
		rules_channel_id: null,
		max_presences: null,
		max_members: 250000,
		vanity_url_code: null,
		description: guild.description ?? null,
		banner: guild.banner ?? null,
		premium_tier: guild.premiumTier ?? GuildPremiumTier.None,
		premium_subscription_count: 0,
		preferred_locale: guild.preferredLocale ?? 'en-US',
		public_updates_channel_id: null,
		max_video_channel_users: 25,
		max_stage_video_channel_users: 50,
		nsfw_level: GuildNSFWLevel.Default,
		stickers: guild.stickers
			.map((id) => sessionState.stickers.get(id))
			.filter((s): s is MockSticker => s !== undefined)
			.map(mockStickerToAPISticker),
		premium_progress_bar_enabled: guild.premiumProgressBarEnabled ?? false,
		safety_alerts_channel_id: null,

		// GUILD_CREATE specific fields
		joined_at: joinedAt,
		large: false,
		unavailable: false,
		member_count: members.length,
		voice_states: Array.from(sessionState.voiceStates.values())
			.filter((vs) => vs.guild_id === guild.id && vs.channel_id !== null)
			.map((vs) => ({
				guild_id: vs.guild_id,
				channel_id: vs.channel_id,
				user_id: vs.user_id,
				session_id: vs.session_id ?? '',
				deaf: vs.deaf ?? false,
				mute: vs.mute ?? false,
				self_deaf: vs.self_deaf ?? false,
				self_mute: vs.self_mute ?? false,
				suppress: vs.suppress ?? false,
				request_to_speak_timestamp: vs.request_to_speak_timestamp ?? null
			})),
		members,
		channels,
		threads,
		presences: [],
		stage_instances: [],
		guild_scheduled_events: []
	}

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'GUILD_CREATE',
		d: data
	}
}

// ============================================================================
// GUILD_STICKERS_UPDATE Payload
// ============================================================================

/**
 * Options for building a GUILD_STICKERS_UPDATE payload
 */
export interface GuildStickersUpdatePayloadOptions {
	guildId: Snowflake
	stickers: MockSticker[]
	sequence: number
}

/**
 * Build a GUILD_STICKERS_UPDATE payload (op 0, t: "GUILD_STICKERS_UPDATE")
 * Sent when guild stickers are updated (create, modify, delete)
 */
export function buildGuildStickersUpdatePayload(options: GuildStickersUpdatePayloadOptions): GatewayPayload {
	const { guildId, stickers, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'GUILD_STICKERS_UPDATE',
		d: {
			guild_id: guildId,
			stickers: stickers.map(mockStickerToAPISticker)
		}
	}
}

// ============================================================================
// GUILD_EMOJIS_UPDATE Payload
// ============================================================================

/**
 * Options for building a GUILD_EMOJIS_UPDATE payload
 */
export interface GuildEmojisUpdatePayloadOptions {
	guildId: Snowflake
	emojis: MockEmoji[]
	sequence: number
}

/**
 * Build a GUILD_EMOJIS_UPDATE payload (op 0, t: "GUILD_EMOJIS_UPDATE")
 * Sent when guild emojis are updated (create, modify, delete)
 * @see https://discord.com/developers/docs/events/gateway-events#guild-emojis-update
 */
export function buildGuildEmojisUpdatePayload(options: GuildEmojisUpdatePayloadOptions): GatewayPayload {
	const { guildId, emojis, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'GUILD_EMOJIS_UPDATE',
		d: {
			guild_id: guildId,
			emojis: emojis.map(mockEmojiToAPIEmoji)
		}
	}
}

// ============================================================================
// WEBHOOKS_UPDATE Payload
// ============================================================================

/**
 * Options for building a WEBHOOKS_UPDATE payload
 */
export interface WebhooksUpdatePayloadOptions {
	guildId: Snowflake
	channelId: Snowflake
	sequence: number
}

/**
 * Build a WEBHOOKS_UPDATE payload (op 0, t: "WEBHOOKS_UPDATE")
 * Sent when a channel's webhooks are updated (create, modify, delete)
 *
 * @see https://discord.com/developers/docs/events/gateway-events#webhooks-update
 */
export function buildWebhooksUpdatePayload(options: WebhooksUpdatePayloadOptions): GatewayPayload {
	const { guildId, channelId, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'WEBHOOKS_UPDATE',
		d: {
			guild_id: guildId,
			channel_id: channelId
		}
	}
}

// ============================================================================
// Role Event Payloads
// ============================================================================

/**
 * Options for building a GUILD_ROLE_CREATE payload
 */
export interface GuildRoleCreatePayloadOptions {
	guildId: Snowflake
	role: MockRole
	sequence: number
}

/**
 * Build a GUILD_ROLE_CREATE payload (op 0, t: "GUILD_ROLE_CREATE")
 * Sent when a new role is created in a guild
 * @see https://discord.com/developers/docs/events/gateway-events#guild-role-create
 */
export function buildGuildRoleCreatePayload(options: GuildRoleCreatePayloadOptions): GatewayPayload {
	const { guildId, role, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'GUILD_ROLE_CREATE',
		d: {
			guild_id: guildId,
			role: mockRoleToAPIRole(role)
		}
	}
}

/**
 * Options for building a GUILD_ROLE_UPDATE payload
 */
export interface GuildRoleUpdatePayloadOptions {
	guildId: Snowflake
	role: MockRole
	sequence: number
}

/**
 * Build a GUILD_ROLE_UPDATE payload (op 0, t: "GUILD_ROLE_UPDATE")
 * Sent when a role is updated
 * @see https://discord.com/developers/docs/events/gateway-events#guild-role-update
 */
export function buildGuildRoleUpdatePayload(options: GuildRoleUpdatePayloadOptions): GatewayPayload {
	const { guildId, role, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'GUILD_ROLE_UPDATE',
		d: {
			guild_id: guildId,
			role: mockRoleToAPIRole(role)
		}
	}
}

/**
 * Options for building a GUILD_ROLE_DELETE payload
 */
export interface GuildRoleDeletePayloadOptions {
	guildId: Snowflake
	roleId: Snowflake
	sequence: number
}

/**
 * Build a GUILD_ROLE_DELETE payload (op 0, t: "GUILD_ROLE_DELETE")
 * Sent when a role is deleted
 * @see https://discord.com/developers/docs/events/gateway-events#guild-role-delete
 */
export function buildGuildRoleDeletePayload(options: GuildRoleDeletePayloadOptions): GatewayPayload {
	const { guildId, roleId, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'GUILD_ROLE_DELETE',
		d: {
			guild_id: guildId,
			role_id: roleId
		}
	}
}

// ============================================================================
// Guild Member Event Payloads
// ============================================================================

/**
 * Options for building a GUILD_MEMBER_ADD payload
 */
export interface GuildMemberAddPayloadOptions {
	guildId: Snowflake
	member: MockGuildMember
	user: MockUser
	sequence: number
}

/**
 * Build a GUILD_MEMBER_ADD payload (op 0, t: "GUILD_MEMBER_ADD")
 * Sent when a member joins a guild
 * @see https://discord.com/developers/docs/events/gateway-events#guild-member-add
 */
export function buildGuildMemberAddPayload(options: GuildMemberAddPayloadOptions): GatewayPayload {
	const { guildId, member, user, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'GUILD_MEMBER_ADD',
		d: {
			...mockGuildMemberToAPIMember(member, user),
			guild_id: guildId
		}
	}
}

/**
 * Options for building a GUILD_MEMBER_UPDATE payload
 */
export interface GuildMemberUpdatePayloadOptions {
	guildId: Snowflake
	member: MockGuildMember
	user: MockUser
	sequence: number
}

/**
 * Build a GUILD_MEMBER_UPDATE payload (op 0, t: "GUILD_MEMBER_UPDATE")
 * Sent when a member is updated (roles, nickname, etc)
 * @see https://discord.com/developers/docs/events/gateway-events#guild-member-update
 */
export function buildGuildMemberUpdatePayload(options: GuildMemberUpdatePayloadOptions): GatewayPayload {
	const { guildId, member, user, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'GUILD_MEMBER_UPDATE',
		d: {
			guild_id: guildId,
			roles: member.roles,
			user: mockUserToAPIUser(user),
			nick: member.nick,
			avatar: member.avatar,
			joined_at: member.joinedAt,
			premium_since: member.premiumSince,
			deaf: member.deaf,
			mute: member.mute,
			pending: member.pending,
			communication_disabled_until: member.communicationDisabledUntil
		}
	}
}

/**
 * Options for building a GUILD_MEMBER_REMOVE payload
 */
export interface GuildMemberRemovePayloadOptions {
	guildId: Snowflake
	user: MockUser
	sequence: number
}

/**
 * Build a GUILD_MEMBER_REMOVE payload (op 0, t: "GUILD_MEMBER_REMOVE")
 * Sent when a member leaves or is removed from a guild
 * @see https://discord.com/developers/docs/events/gateway-events#guild-member-remove
 */
export function buildGuildMemberRemovePayload(options: GuildMemberRemovePayloadOptions): GatewayPayload {
	const { guildId, user, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'GUILD_MEMBER_REMOVE',
		d: {
			guild_id: guildId,
			user: mockUserToAPIUser(user)
		}
	}
}

// ============================================================================
// GUILD_BAN_ADD and GUILD_BAN_REMOVE Payloads
// ============================================================================

/**
 * Options for building a GUILD_BAN_ADD payload
 */
export interface GuildBanAddPayloadOptions {
	guildId: string
	user: MockUser
	sequence: number
}

/**
 * Build a GUILD_BAN_ADD payload (op 0, t: "GUILD_BAN_ADD")
 * Sent when a user is banned from a guild
 * @see https://discord.com/developers/docs/events/gateway-events#guild-ban-add
 */
export function buildGuildBanAddPayload(options: GuildBanAddPayloadOptions): GatewayPayload {
	const { guildId, user, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'GUILD_BAN_ADD',
		d: {
			guild_id: guildId,
			user: mockUserToAPIUser(user)
		}
	}
}

/**
 * Options for building a GUILD_BAN_REMOVE payload
 */
export interface GuildBanRemovePayloadOptions {
	guildId: string
	user: MockUser
	sequence: number
}

/**
 * Build a GUILD_BAN_REMOVE payload (op 0, t: "GUILD_BAN_REMOVE")
 * Sent when a user is unbanned from a guild
 * @see https://discord.com/developers/docs/events/gateway-events#guild-ban-remove
 */
export function buildGuildBanRemovePayload(options: GuildBanRemovePayloadOptions): GatewayPayload {
	const { guildId, user, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'GUILD_BAN_REMOVE',
		d: {
			guild_id: guildId,
			user: mockUserToAPIUser(user)
		}
	}
}

// ============================================================================
// MESSAGE_CREATE Payload
// ============================================================================

/**
 * Options for building a MESSAGE_CREATE payload
 */
export interface MessageCreatePayloadOptions {
	message: MockMessage
	author: MockUser
	sessionState: SessionState
	sequence: number
}

/**
 * Build a partial guild member object (without user field) for MESSAGE_CREATE
 * Discord sends partial member data with messages in guilds
 */
export function buildPartialGuildMember(_user: MockUser, joinedAt?: string): Omit<APIGuildMember, 'user'> {
	return {
		roles: [],
		joined_at: joinedAt ?? new Date().toISOString(),
		deaf: false,
		mute: false,
		flags: 0 as APIGuildMember['flags']
	}
}

/**
 * Convert MockMessage to Discord APIMessage format
 */
export function mockMessageToAPIMessage(message: MockMessage, author: MockUser): APIMessage {
	const apiMessage: APIMessage = {
		id: message.id,
		channel_id: message.channelId,
		author: mockUserToAPIUser(author),
		content: message.content,
		timestamp: message.timestamp,
		edited_timestamp: message.editedTimestamp,
		tts: message.tts,
		mention_everyone: message.mentionEveryone,
		mentions: [], // Will be populated with user objects if there are mentions
		mention_roles: message.mentionRoles,
		attachments: message.attachments as APIMessage['attachments'],
		embeds: message.embeds as APIMessage['embeds'],
		pinned: message.pinned,
		type: message.type as MessageType,
		nonce: message.nonce ?? undefined
	}

	// Add reactions (always include to ensure Discord.js cache is updated)
	// Include empty array to clear reactions, or populated array if reactions exist
	if (message.reactions !== undefined) {
		apiMessage.reactions = message.reactions.map((r) => ({
			count: r.count,
			count_details: r.count_details,
			me: r.me,
			me_burst: r.me_burst,
			emoji: r.emoji,
			burst_colors: r.burst_colors
		}))
	}

	// Add optional fields if present

	// Call info for voice/video calls in DMs (MessageType.Call = 3)
	if (message.call) {
		apiMessage.call = {
			participants: message.call.participants,
			ended_timestamp: message.call.ended_timestamp ?? null
		}
	}

	// Interaction metadata (new field that replaces deprecated interaction)
	if (message.interaction_metadata) {
		// Build metadata object with required fields first
		const metadata: Record<string, unknown> = {
			id: message.interaction_metadata.id,
			type: message.interaction_metadata.type,
			user: mockUserToAPIUser(message.interaction_metadata.user),
			authorizing_integration_owners: message.interaction_metadata.authorizing_integration_owners ?? {}
		}

		// Add optional fields
		if (message.interaction_metadata.name) {
			metadata.name = message.interaction_metadata.name
		}
		if (message.interaction_metadata.original_response_message_id) {
			metadata.original_response_message_id = message.interaction_metadata.original_response_message_id
		}
		if (message.interaction_metadata.target_user) {
			metadata.target_user = mockUserToAPIUser(message.interaction_metadata.target_user)
		}
		if (message.interaction_metadata.target_message_id) {
			metadata.target_message_id = message.interaction_metadata.target_message_id
		}

		apiMessage.interaction_metadata = metadata as unknown as APIMessageInteractionMetadata
	}

	// Keep deprecated interaction field for backwards compatibility
	if (message.interaction) {
		apiMessage.interaction = {
			id: message.interaction.id,
			type: message.interaction.type as InteractionType,
			name: message.interaction.name,
			user: mockUserToAPIUser(message.interaction.user)
		}
	}

	// Message snapshots for forwarded messages
	if (message.message_snapshots?.length) {
		apiMessage.message_snapshots = message.message_snapshots.map((snapshot: MockMessageSnapshot): APIMessageSnapshot => ({
			message: {
				type: snapshot.message.type as MessageType,
				content: snapshot.message.content,
				embeds: snapshot.message.embeds as APIEmbed[],
				attachments: snapshot.message.attachments as APIAttachment[],
				timestamp: snapshot.message.timestamp,
				edited_timestamp: snapshot.message.edited_timestamp,
				mentions: snapshot.message.mentions.map((u) => mockUserToAPIUser(u)),
				mention_roles: snapshot.message.mention_roles
			}
		}))
	}

	// Resolved data for auto-populated select menus
	if (message.resolved) {
		apiMessage.resolved = message.resolved as APIMessage['resolved']
	}

	// Components V2
	if (message.flags !== undefined) {
		apiMessage.flags = message.flags
	}
	if (message.components) {
		apiMessage.components = message.components as APIMessage['components']
	}

	// Polls
	if (message.poll) {
		;(apiMessage as unknown as { poll: unknown }).poll = message.poll
	}

	// Message reference (for replies)
	if (message.message_reference) {
		apiMessage.message_reference = {
			message_id: message.message_reference.message_id,
			channel_id: message.message_reference.channel_id ?? message.channelId,
			guild_id: message.message_reference.guild_id ?? message.guildId
		}
	}

	// Stickers
	if (message.sticker_items?.length) {
		;(apiMessage as unknown as { sticker_items: unknown[] }).sticker_items = message.sticker_items
	}

	// Role subscription data
	if (message.roleSubscriptionData) {
		;(apiMessage as any).role_subscription_data = {
			role_subscription_listing_id: message.roleSubscriptionData.roleSubscriptionListingId,
			tier_name: message.roleSubscriptionData.tierName,
			total_months_subscribed: message.roleSubscriptionData.totalMonthsSubscribed,
			is_renewal: message.roleSubscriptionData.isRenewal
		}
	}

	// Message position
	if (message.position !== undefined) {
		apiMessage.position = message.position
	}

	return apiMessage
}

/**
 * Build a MESSAGE_CREATE payload (op 0, t: "MESSAGE_CREATE")
 * Sent by server when a message is created (either injected or from REST API)
 */
export function buildMessageCreatePayload(options: MessageCreatePayloadOptions): GatewayPayload {
	const { message, author, sessionState, sequence } = options

	// Build base message
	const apiMessage = mockMessageToAPIMessage(message, author)

	// Build the dispatch data
	const data: APIMessage & {
		guild_id?: Snowflake
		member?: Omit<APIGuildMember, 'user'>
	} = {
		...apiMessage
	}

	// Add guild-specific fields if this is a guild message
	if (message.guildId) {
		data.guild_id = message.guildId

		// Add partial member data for the author
		data.member = buildPartialGuildMember(author)
	}

	// Build mentions array with member info if there are mentioned users
	if (message.mentions.length > 0) {
		const mentionsWithMembers: (APIUser & { member?: Omit<APIGuildMember, 'user'> })[] = []

		for (const userId of message.mentions) {
			const user = sessionState.users.get(userId)
			if (user) {
				const mentionData: APIUser & { member?: Omit<APIGuildMember, 'user'> } = mockUserToAPIUser(user)
				// Add member info for guild messages
				if (message.guildId) {
					mentionData.member = buildPartialGuildMember(user)
				}
				mentionsWithMembers.push(mentionData)
			}
		}

		data.mentions = mentionsWithMembers as APIMessage['mentions']
	}

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'MESSAGE_CREATE',
		d: data
	}
}

// ============================================================================
// MESSAGE_UPDATE Payload
// ============================================================================

/**
 * Options for building a MESSAGE_UPDATE payload
 */
export interface MessageUpdatePayloadOptions {
	message: MockMessage
	author: MockUser
	sessionState: SessionState
	sequence: number
}

/**
 * Build a MESSAGE_UPDATE payload (op 0, t: "MESSAGE_UPDATE")
 * Sent when a message is edited
 */
export function buildMessageUpdatePayload(options: MessageUpdatePayloadOptions): GatewayPayload {
	const { message, author, sequence } = options

	// Build base message (same as MESSAGE_CREATE)
	const apiMessage = mockMessageToAPIMessage(message, author)

	const data: APIMessage & {
		guild_id?: Snowflake
		member?: Omit<APIGuildMember, 'user'>
	} = { ...apiMessage }

	// Add guild-specific fields if this is a guild message
	if (message.guildId) {
		data.guild_id = message.guildId
		data.member = buildPartialGuildMember(author)
	}

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'MESSAGE_UPDATE',
		d: data
	}
}

// ============================================================================
// MESSAGE_DELETE Payload
// ============================================================================

/**
 * Options for building a MESSAGE_DELETE payload
 */
export interface MessageDeletePayloadOptions {
	messageId: Snowflake
	channelId: Snowflake
	guildId?: Snowflake
	sequence: number
}

/**
 * Build a MESSAGE_DELETE payload (op 0, t: "MESSAGE_DELETE")
 * Sent when a message is deleted
 */
export function buildMessageDeletePayload(options: MessageDeletePayloadOptions): GatewayPayload {
	const { messageId, channelId, guildId, sequence } = options

	const data: { id: Snowflake; channel_id: Snowflake; guild_id?: Snowflake } = {
		id: messageId,
		channel_id: channelId
	}

	if (guildId) {
		data.guild_id = guildId
	}

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'MESSAGE_DELETE',
		d: data
	}
}

// ============================================================================
// MESSAGE_POLL_VOTE Payloads
// ============================================================================

/**
 * Options for building MESSAGE_POLL_VOTE_ADD/REMOVE payloads
 */
export interface MessagePollVotePayloadOptions {
	userId: Snowflake
	channelId: Snowflake
	messageId: Snowflake
	guildId?: Snowflake
	answerId: number
	sequence: number
}

/**
 * Build a MESSAGE_POLL_VOTE_ADD payload (op 0, t: "MESSAGE_POLL_VOTE_ADD")
 * Sent when a user votes in a poll
 */
export function buildMessagePollVoteAddPayload(options: MessagePollVotePayloadOptions): GatewayPayload {
	const { userId, channelId, messageId, guildId, answerId, sequence } = options

	const data: {
		user_id: Snowflake
		channel_id: Snowflake
		message_id: Snowflake
		guild_id?: Snowflake
		answer_id: number
	} = {
		user_id: userId,
		channel_id: channelId,
		message_id: messageId,
		answer_id: answerId
	}

	if (guildId) {
		data.guild_id = guildId
	}

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'MESSAGE_POLL_VOTE_ADD',
		d: data
	}
}

/**
 * Build a MESSAGE_POLL_VOTE_REMOVE payload (op 0, t: "MESSAGE_POLL_VOTE_REMOVE")
 * Sent when a user removes their vote from a poll (multiselect only)
 */
export function buildMessagePollVoteRemovePayload(options: MessagePollVotePayloadOptions): GatewayPayload {
	const { userId, channelId, messageId, guildId, answerId, sequence } = options

	const data: {
		user_id: Snowflake
		channel_id: Snowflake
		message_id: Snowflake
		guild_id?: Snowflake
		answer_id: number
	} = {
		user_id: userId,
		channel_id: channelId,
		message_id: messageId,
		answer_id: answerId
	}

	if (guildId) {
		data.guild_id = guildId
	}

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'MESSAGE_POLL_VOTE_REMOVE',
		d: data
	}
}

// ============================================================================
// INTERACTION_CREATE Payload
// ============================================================================

/**
 * Entitlement data for interactions
 */
export type InteractionEntitlement = {
	id: Snowflake
	sku_id: Snowflake
	application_id?: Snowflake
	user_id?: Snowflake
	type: number
	deleted: boolean
	starts_at?: string
	ends_at?: string
}

/**
 * Options for building an INTERACTION_CREATE payload
 */
export interface InteractionCreatePayloadOptions {
	interaction: MockInteraction
	user: MockUser
	sessionState: SessionState
	sequence: number
	entitlements?: InteractionEntitlement[]
}

/**
 * Build an INTERACTION_CREATE payload (op 0, t: "INTERACTION_CREATE")
 * For slash commands (type 2 APPLICATION_COMMAND)
 */
export function buildInteractionCreatePayload(options: InteractionCreatePayloadOptions): GatewayPayload {
	const { interaction, user, sessionState, sequence } = options

	// Build command data
	const commandData: Record<string, unknown> = {
		id: interaction.commandId ?? generateSnowflake(),
		name: interaction.commandName,
		type: ApplicationCommandType.ChatInput // Slash command
	}

	// Add options if present
	if (interaction.options && interaction.options.length > 0) {
		commandData.options = interaction.options.map((opt) => ({
			name: opt.name,
			type: opt.type,
			value: opt.value,
			options: opt.options,
			focused: opt.focused
		}))
	}

	// Get channel info from state for the channel object (Discord API spec)
	const channel = sessionState.channels.get(interaction.channelId)

	const data: Record<string, unknown> = {
		id: interaction.id,
		application_id: interaction.applicationId,
		type: InteractionType.ApplicationCommand,
		data: commandData,
		channel_id: interaction.channelId, // Deprecated but kept for backwards compatibility
		channel: {
			id: interaction.channelId,
			type: channel?.type ?? 0, // Default to GUILD_TEXT
			name: channel?.name,
			guild_id: interaction.guildId,
			permissions: '562949953421311' // Match app_permissions
		},
		token: interaction.token,
		version: 1,
		entitlements: options.entitlements ?? [],
		authorizing_integration_owners: {},
		locale: 'en-US',
		app_permissions: '562949953421311' // Full permissions
	}

	// Guild context
	if (interaction.guildId) {
		data.guild_id = interaction.guildId
		data.guild_locale = 'en-US'
		data.member = {
			user: mockUserToAPIUser(user),
			roles: [],
			joined_at: new Date().toISOString(),
			deaf: false,
			mute: false,
			flags: 0
		}
	} else {
		// DM context
		data.user = mockUserToAPIUser(user)
	}

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'INTERACTION_CREATE',
		d: data
	}
}

// INTERACTION_CREATE Payload - Button
// ============================================================================

/**
 * Options for building a button INTERACTION_CREATE payload
 */
export interface ButtonInteractionPayloadOptions {
	interaction: MockInteraction
	user: MockUser
	message: MockMessage // The message containing the button
	sessionState: SessionState
	sequence: number
	entitlements?: InteractionEntitlement[]
}

/**
 * Build an INTERACTION_CREATE payload for button clicks (op 0, t: "INTERACTION_CREATE")
 * For button interactions (type 3 MESSAGE_COMPONENT, component_type 2)
 */
export function buildButtonInteractionPayload(options: ButtonInteractionPayloadOptions): GatewayPayload {
	const { interaction, user, message, sessionState, sequence } = options

	// Build component data
	const componentData: Record<string, unknown> = {
		component_type: ComponentType.Button, // 2
		custom_id: interaction.customId
	}

	// Get the message author for the API message
	const messageAuthor = sessionState.users.get(message.authorId)

	// Get channel info from state for the channel object (Discord API spec)
	const channel = sessionState.channels.get(interaction.channelId)

	const data: Record<string, unknown> = {
		id: interaction.id,
		application_id: interaction.applicationId,
		type: InteractionType.MessageComponent, // 3
		data: componentData,
		channel_id: interaction.channelId, // Deprecated but kept for backwards compatibility
		channel: {
			id: interaction.channelId,
			type: channel?.type ?? 0, // Default to GUILD_TEXT
			name: channel?.name,
			guild_id: interaction.guildId,
			permissions: '562949953421311' // Match app_permissions
		},
		token: interaction.token,
		version: 1,
		entitlements: options.entitlements ?? [],
		authorizing_integration_owners: {},
		locale: 'en-US',
		app_permissions: '562949953421311', // Full permissions
		// Include the source message
		message: messageAuthor ? mockMessageToAPIMessage(message, messageAuthor) : mockMessageToAPIMessage(message, sessionState.botUser)
	}

	// Add guild_id to message if present
	if (message.guildId) {
		;(data.message as Record<string, unknown>).guild_id = message.guildId
	}

	// Guild context
	if (interaction.guildId) {
		data.guild_id = interaction.guildId
		data.guild_locale = 'en-US'
		data.member = {
			user: mockUserToAPIUser(user),
			roles: [],
			joined_at: new Date().toISOString(),
			deaf: false,
			mute: false,
			flags: 0
		}
	} else {
		// DM context
		data.user = mockUserToAPIUser(user)
	}

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'INTERACTION_CREATE',
		d: data
	}
}

// INTERACTION_CREATE Payload - Select Menu
// ============================================================================

/**
 * Options for building a select menu INTERACTION_CREATE payload
 */
export interface SelectMenuInteractionPayloadOptions {
	interaction: MockInteraction
	user: MockUser
	message: MockMessage // The message containing the select menu
	values: string[] // Selected values
	sessionState: SessionState
	sequence: number
	entitlements?: InteractionEntitlement[]
}

/**
 * Build resolved data for entity select types (UserSelect, RoleSelect, MentionableSelect, ChannelSelect)
 * Returns the resolved entities that correspond to the selected values.
 */
function buildResolvedData(
	componentType: ComponentType,
	values: string[],
	sessionState: SessionState,
	_guildId?: string
): Record<string, Record<string, unknown>> | null {
	// StringSelect (3) doesn't have resolved data
	if (componentType === ComponentType.StringSelect) {
		return null
	}

	const resolved: Record<string, Record<string, unknown>> = {}

	switch (componentType) {
		case ComponentType.UserSelect: {
			// Resolve users by their IDs
			const users: Record<string, unknown> = {}
			for (const userId of values) {
				const user = sessionState.users.get(userId)
				if (user) {
					users[userId] = mockUserToAPIUser(user)
				}
			}
			if (Object.keys(users).length > 0) {
				resolved.users = users
			}
			break
		}

		case ComponentType.RoleSelect: {
			// Resolve roles by their IDs
			const roles: Record<string, unknown> = {}
			for (const roleId of values) {
				const role = sessionState.roles.get(roleId)
				if (role) {
					roles[roleId] = mockRoleToAPIRole(role)
				}
			}
			if (Object.keys(roles).length > 0) {
				resolved.roles = roles
			}
			break
		}

		case ComponentType.MentionableSelect: {
			// Resolve both users and roles
			const users: Record<string, unknown> = {}
			const roles: Record<string, unknown> = {}

			for (const id of values) {
				// Check if it's a user
				const user = sessionState.users.get(id)
				if (user) {
					users[id] = mockUserToAPIUser(user)
					continue
				}

				// Check if it's a role
				const role = sessionState.roles.get(id)
				if (role) {
					roles[id] = mockRoleToAPIRole(role)
				}
			}

			if (Object.keys(users).length > 0) {
				resolved.users = users
			}
			if (Object.keys(roles).length > 0) {
				resolved.roles = roles
			}
			break
		}

		case ComponentType.ChannelSelect: {
			// Resolve channels by their IDs
			const channels: Record<string, unknown> = {}
			for (const channelId of values) {
				const channel = sessionState.channels.get(channelId)
				if (channel) {
					channels[channelId] = mockChannelToAPIChannel(channel)
				}
			}
			if (Object.keys(channels).length > 0) {
				resolved.channels = channels
			}
			break
		}
	}

	return Object.keys(resolved).length > 0 ? resolved : null
}

/**
 * Build an INTERACTION_CREATE payload for select menu interactions (op 0, t: "INTERACTION_CREATE")
 * For MESSAGE_COMPONENT (type 3) with component_type 3 (StringSelect), 5 (UserSelect),
 * 6 (RoleSelect), 7 (MentionableSelect), or 8 (ChannelSelect)
 */
export function buildSelectMenuInteractionPayload(options: SelectMenuInteractionPayloadOptions): GatewayPayload {
	const { interaction, user, message, values, sessionState, sequence } = options

	// Default to StringSelect (3) if componentType not specified
	const componentType = interaction.componentType ?? ComponentType.StringSelect

	// Build component data with values
	const componentData: Record<string, unknown> = {
		component_type: componentType,
		custom_id: interaction.customId,
		values: values
	}

	// Build resolved data for entity select types (UserSelect, RoleSelect, MentionableSelect, ChannelSelect)
	const resolved = buildResolvedData(componentType, values, sessionState, interaction.guildId)
	if (resolved && Object.keys(resolved).length > 0) {
		componentData.resolved = resolved
	}

	// Get the message author for the API message
	const messageAuthor = sessionState.users.get(message.authorId)

	// Get channel info from state for the channel object (Discord API spec)
	const channel = sessionState.channels.get(interaction.channelId)

	const data: Record<string, unknown> = {
		id: interaction.id,
		application_id: interaction.applicationId,
		type: InteractionType.MessageComponent, // 3
		data: componentData,
		channel_id: interaction.channelId, // Deprecated but kept for backwards compatibility
		channel: {
			id: interaction.channelId,
			type: channel?.type ?? 0, // Default to GUILD_TEXT
			name: channel?.name,
			guild_id: interaction.guildId,
			permissions: '562949953421311' // Match app_permissions
		},
		token: interaction.token,
		version: 1,
		entitlements: options.entitlements ?? [],
		authorizing_integration_owners: {},
		locale: 'en-US',
		app_permissions: '562949953421311', // Full permissions
		// Include the source message for select menu
		message: messageAuthor ? mockMessageToAPIMessage(message, messageAuthor) : mockMessageToAPIMessage(message, sessionState.botUser)
	}

	// Add guild_id to message if present
	if (message.guildId) {
		;(data.message as Record<string, unknown>).guild_id = message.guildId
	}

	// Guild context
	if (interaction.guildId) {
		data.guild_id = interaction.guildId
		data.guild_locale = 'en-US'
		data.member = {
			user: mockUserToAPIUser(user),
			roles: [],
			joined_at: new Date().toISOString(),
			deaf: false,
			mute: false,
			flags: 0
		}
	} else {
		// DM context
		data.user = mockUserToAPIUser(user)
	}

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'INTERACTION_CREATE',
		d: data
	}
}

// INTERACTION_CREATE Payload - Modal Submit
// ============================================================================

/**
 * Options for building a modal submit INTERACTION_CREATE payload
 */
export interface ModalSubmitInteractionPayloadOptions {
	interaction: MockInteraction
	user: MockUser
	sessionState: SessionState
	sequence: number
	message?: MockMessage // Optional: source message if modal was triggered from a message component
	entitlements?: InteractionEntitlement[]
}

/**
 * Convert fields object to Discord modal components array format
 * Each field becomes an action row with a single text input
 */
function fieldsToComponents(fields: Record<string, string>): unknown[] {
	return Object.entries(fields).map(([customId, value]) => ({
		type: 1, // ActionRow
		components: [
			{
				type: 4, // TextInput
				custom_id: customId,
				value: value
			}
		]
	}))
}

/**
 * Build an INTERACTION_CREATE payload for modal submit interactions (op 0, t: "INTERACTION_CREATE")
 * For MODAL_SUBMIT (type 5)
 */
export function buildModalSubmitInteractionPayload(options: ModalSubmitInteractionPayloadOptions): GatewayPayload {
	const { interaction, user, sessionState, sequence, message } = options

	// Build modal data with components
	const modalData: Record<string, unknown> = {
		custom_id: interaction.customId,
		components: fieldsToComponents(interaction.modalFields ?? {})
	}

	// Get channel info from state for the channel object (Discord API spec)
	const channel = sessionState.channels.get(interaction.channelId)

	const data: Record<string, unknown> = {
		id: interaction.id,
		application_id: interaction.applicationId,
		type: InteractionType.ModalSubmit, // 5
		data: modalData,
		channel_id: interaction.channelId, // Deprecated but kept for backwards compatibility
		channel: {
			id: interaction.channelId,
			type: channel?.type ?? 0, // Default to GUILD_TEXT
			name: channel?.name,
			guild_id: interaction.guildId,
			permissions: '562949953421311' // Match app_permissions
		},
		token: interaction.token,
		version: 1,
		entitlements: options.entitlements ?? [],
		authorizing_integration_owners: {},
		locale: 'en-US',
		app_permissions: '562949953421311' // Full permissions
	}

	// Add message if modal was triggered from a message component (links to original interaction)
	if (message) {
		const messageAuthor = sessionState.users.get(message.authorId)
		data.message = messageAuthor ? mockMessageToAPIMessage(message, messageAuthor) : mockMessageToAPIMessage(message, sessionState.botUser)

		// Add guild_id to message if present
		if (message.guildId) {
			;(data.message as Record<string, unknown>).guild_id = message.guildId
		}
	}

	// Guild context
	if (interaction.guildId) {
		data.guild_id = interaction.guildId
		data.guild_locale = 'en-US'
		data.member = {
			user: mockUserToAPIUser(user),
			roles: [],
			joined_at: new Date().toISOString(),
			deaf: false,
			mute: false,
			flags: 0
		}
	} else {
		// DM context
		data.user = mockUserToAPIUser(user)
	}

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'INTERACTION_CREATE',
		d: data
	}
}

// INTERACTION_CREATE Payload - Autocomplete
// ============================================================================

/**
 * Options for building an autocomplete INTERACTION_CREATE payload
 */
export interface AutocompleteInteractionPayloadOptions {
	interaction: MockInteraction
	user: MockUser
	sessionState: SessionState
	sequence: number
	entitlements?: InteractionEntitlement[]
}

/**
 * Build an INTERACTION_CREATE payload for autocomplete interactions (op 0, t: "INTERACTION_CREATE")
 * For APPLICATION_COMMAND_AUTOCOMPLETE (type 4)
 */
export function buildAutocompleteInteractionPayload(options: AutocompleteInteractionPayloadOptions): GatewayPayload {
	const { interaction, user, sessionState, sequence } = options

	// Build command data - similar to slash command but type 4
	const commandData: Record<string, unknown> = {
		id: interaction.commandId ?? generateSnowflake(),
		name: interaction.commandName,
		type: ApplicationCommandType.ChatInput
	}

	// Add options - MUST include focused flag for autocomplete
	if (interaction.options && interaction.options.length > 0) {
		commandData.options = interaction.options.map((opt) => ({
			name: opt.name,
			type: opt.type,
			value: opt.value,
			focused: opt.focused // Critical for autocomplete
		}))
	}

	// Get channel info from state for the channel object (Discord API spec)
	const channel = sessionState.channels.get(interaction.channelId)

	const data: Record<string, unknown> = {
		id: interaction.id,
		application_id: interaction.applicationId,
		type: InteractionType.ApplicationCommandAutocomplete, // 4
		data: commandData,
		channel_id: interaction.channelId, // Deprecated but kept for backwards compatibility
		channel: {
			id: interaction.channelId,
			type: channel?.type ?? 0, // Default to GUILD_TEXT
			name: channel?.name,
			guild_id: interaction.guildId,
			permissions: '562949953421311' // Match app_permissions
		},
		token: interaction.token,
		version: 1,
		entitlements: options.entitlements ?? [],
		authorizing_integration_owners: {},
		locale: 'en-US',
		app_permissions: '562949953421311' // Full permissions
	}

	// Guild context
	if (interaction.guildId) {
		data.guild_id = interaction.guildId
		data.guild_locale = 'en-US'
		data.member = {
			user: mockUserToAPIUser(user),
			roles: [],
			joined_at: new Date().toISOString(),
			deaf: false,
			mute: false,
			flags: 0
		}
	} else {
		// DM context
		data.user = mockUserToAPIUser(user)
	}

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'INTERACTION_CREATE',
		d: data
	}
}

// INTERACTION_CREATE Payload - Context Menu
// ============================================================================

/**
 * Options for building a context menu INTERACTION_CREATE payload
 */
export interface ContextMenuInteractionPayloadOptions {
	interaction: MockInteraction
	user: MockUser
	/** Target user for USER commands */
	targetUser?: MockUser
	/** Target message for MESSAGE commands */
	targetMessage?: MockMessage
	sessionState: SessionState
	sequence: number
	entitlements?: InteractionEntitlement[]
}

/**
 * Build an INTERACTION_CREATE payload for context menu commands (op 0, t: "INTERACTION_CREATE")
 * For USER (type 2) and MESSAGE (type 3) application commands
 */
export function buildContextMenuInteractionPayload(options: ContextMenuInteractionPayloadOptions): GatewayPayload {
	const { interaction, user, targetUser, targetMessage, sessionState, sequence } = options

	// Determine command type (2=USER, 3=MESSAGE)
	const commandType = interaction.contextMenuType ?? 2

	// Build command data with target_id and resolved
	const commandData: Record<string, unknown> = {
		id: interaction.commandId ?? generateSnowflake(),
		name: interaction.commandName,
		type: commandType, // ApplicationCommandType.User (2) or Message (3)
		target_id: interaction.targetId
	}

	// Build resolved data based on command type
	const resolved: Record<string, Record<string, unknown>> = {}

	if (commandType === 2 && targetUser) {
		// USER command - resolve the target user
		resolved.users = {
			[interaction.targetId!]: mockUserToAPIUser(targetUser)
		}
		// Add member data if in guild context
		if (interaction.guildId) {
			resolved.members = {
				[interaction.targetId!]: {
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false,
					flags: 0
				}
			}
		}
	} else if (commandType === 3 && targetMessage) {
		// MESSAGE command - resolve the target message
		const messageAuthor = sessionState.users.get(targetMessage.authorId) ?? sessionState.botUser
		resolved.messages = {
			[interaction.targetId!]: mockMessageToAPIMessage(targetMessage, messageAuthor)
		}
	}

	if (Object.keys(resolved).length > 0) {
		commandData.resolved = resolved
	}

	// Get channel info from state for the channel object (Discord API spec)
	const channel = sessionState.channels.get(interaction.channelId)

	// Build main interaction data
	const data: Record<string, unknown> = {
		id: interaction.id,
		application_id: interaction.applicationId,
		type: InteractionType.ApplicationCommand, // Always 2 for context menus
		data: commandData,
		channel_id: interaction.channelId, // Deprecated but kept for backwards compatibility
		channel: {
			id: interaction.channelId,
			type: channel?.type ?? 0, // Default to GUILD_TEXT
			name: channel?.name,
			guild_id: interaction.guildId,
			permissions: '562949953421311' // Match app_permissions
		},
		token: interaction.token,
		version: 1,
		entitlements: options.entitlements ?? [],
		authorizing_integration_owners: {},
		locale: 'en-US',
		app_permissions: '562949953421311' // Full permissions
	}

	// Guild context
	if (interaction.guildId) {
		data.guild_id = interaction.guildId
		data.guild_locale = 'en-US'
		data.member = {
			user: mockUserToAPIUser(user),
			roles: [],
			joined_at: new Date().toISOString(),
			deaf: false,
			mute: false,
			flags: 0
		}
	} else {
		// DM context
		data.user = mockUserToAPIUser(user)
	}

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'INTERACTION_CREATE',
		d: data
	}
}

// ============================================================================
// Thread Payload Builders
// ============================================================================

/**
 * Convert MockThread to Discord API thread channel format
 * @param thread - The MockThread to convert
 * @param currentUserMember - Optional current user's thread membership (included when user is a member)
 */
export function mockThreadToAPIChannel(thread: MockThread, currentUserMember?: MockThreadMember): APIChannel {
	const result: Record<string, unknown> = {
		id: thread.id,
		type: thread.type as ChannelType,
		guild_id: thread.guildId,
		name: thread.name,
		parent_id: thread.parentId,
		owner_id: thread.ownerId,
		message_count: thread.messageCount,
		member_count: thread.memberCount,
		total_message_sent: thread.totalMessageSent,
		last_message_id: thread.lastMessageId ?? null,
		thread_metadata: {
			archived: thread.threadMetadata.archived,
			auto_archive_duration: thread.threadMetadata.auto_archive_duration,
			archive_timestamp: thread.threadMetadata.archive_timestamp,
			locked: thread.threadMetadata.locked,
			invitable: thread.threadMetadata.invitable,
			create_timestamp: thread.threadMetadata.create_timestamp
		},
		rate_limit_per_user: thread.rateLimitPerUser ?? 0,
		position: 0,
		permission_overwrites: [],
		nsfw: false
	}

	// Include current user's membership if provided
	if (currentUserMember) {
		result.member = {
			id: thread.id,
			user_id: currentUserMember.user_id,
			join_timestamp: currentUserMember.join_timestamp,
			flags: currentUserMember.flags
		}
	}

	return result as unknown as APIChannel
}

/**
 * Options for building a THREAD_CREATE payload
 */
export interface ThreadCreatePayloadOptions {
	thread: MockThread
	sessionState: SessionState
	sequence: number
	newlyCreated?: boolean // True when thread is newly created, false when bot joins existing thread
}

/**
 * Build a THREAD_CREATE payload (op 0, t: "THREAD_CREATE")
 * Sent when a new thread is created or when the bot is added to an existing thread
 */
export function buildThreadCreatePayload(options: ThreadCreatePayloadOptions): GatewayPayload {
	const { thread, sessionState, sequence, newlyCreated = true } = options

	// Include member field if bot is a member of the thread
	const botMember = sessionState.getThreadMember(thread.id, sessionState.botUser.id)

	const data = {
		...mockThreadToAPIChannel(thread, botMember ?? undefined),
		newly_created: newlyCreated
	}

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'THREAD_CREATE',
		d: data
	}
}

/**
 * Options for building a THREAD_UPDATE payload
 */
export interface ThreadUpdatePayloadOptions {
	thread: MockThread
	sessionState: SessionState
	sequence: number
}

/**
 * Build a THREAD_UPDATE payload (op 0, t: "THREAD_UPDATE")
 * Sent when thread metadata is updated (archived, locked, name, etc.)
 */
export function buildThreadUpdatePayload(options: ThreadUpdatePayloadOptions): GatewayPayload {
	const { thread, sessionState, sequence } = options

	// Include member field if bot is a member of the thread
	const botMember = sessionState.getThreadMember(thread.id, sessionState.botUser.id)

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'THREAD_UPDATE',
		d: mockThreadToAPIChannel(thread, botMember ?? undefined)
	}
}

/**
 * Options for building a THREAD_DELETE payload
 */
export interface ThreadDeletePayloadOptions {
	threadId: Snowflake
	guildId: Snowflake
	parentId: Snowflake
	type: 10 | 11 | 12
	sequence: number
}

/**
 * Build a THREAD_DELETE payload (op 0, t: "THREAD_DELETE")
 * Sent when a thread is deleted
 */
export function buildThreadDeletePayload(options: ThreadDeletePayloadOptions): GatewayPayload {
	const { threadId, guildId, parentId, type, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'THREAD_DELETE',
		d: {
			id: threadId,
			guild_id: guildId,
			parent_id: parentId,
			type: type
		}
	}
}

/**
 * Options for building a THREAD_LIST_SYNC payload
 */
export interface ThreadListSyncPayloadOptions {
	guildId: Snowflake
	channelIds?: Snowflake[] // If syncing specific channels, otherwise all guild threads
	threads: MockThread[]
	members: MockThreadMember[]
	sequence: number
}

/**
 * Build a THREAD_LIST_SYNC payload (op 0, t: "THREAD_LIST_SYNC")
 * Sent when bot gains access to channels, contains all active threads in those channels
 */
export function buildThreadListSyncPayload(options: ThreadListSyncPayloadOptions): GatewayPayload {
	const { guildId, channelIds, threads, members, sequence } = options

	const data: Record<string, unknown> = {
		guild_id: guildId,
		threads: threads.map((thread) => mockThreadToAPIChannel(thread)),
		members: members.map((member) => ({
			id: member.id,
			user_id: member.user_id,
			join_timestamp: member.join_timestamp,
			flags: member.flags
		}))
	}

	// Only include channel_ids if syncing specific channels (not entire guild)
	if (channelIds && channelIds.length > 0) {
		data.channel_ids = channelIds
	}

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'THREAD_LIST_SYNC',
		d: data
	}
}

/**
 * Options for building a THREAD_MEMBER_UPDATE payload
 */
export interface ThreadMemberUpdatePayloadOptions {
	threadId: Snowflake
	guildId: Snowflake
	member: MockThreadMember
	sequence: number
}

/**
 * Build a THREAD_MEMBER_UPDATE payload (op 0, t: "THREAD_MEMBER_UPDATE")
 * Sent when the current user's thread member object is updated
 */
export function buildThreadMemberUpdatePayload(options: ThreadMemberUpdatePayloadOptions): GatewayPayload {
	const { threadId, guildId, member, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'THREAD_MEMBER_UPDATE',
		d: {
			id: threadId,
			guild_id: guildId,
			user_id: member.user_id,
			join_timestamp: member.join_timestamp,
			flags: member.flags
		}
	}
}

/**
 * Options for building a THREAD_MEMBERS_UPDATE payload
 */
export interface ThreadMembersUpdatePayloadOptions {
	threadId: Snowflake
	guildId: Snowflake
	memberCount: number
	addedMembers?: MockThreadMember[]
	removedMemberIds?: Snowflake[]
	sequence: number
}

/**
 * Build a THREAD_MEMBERS_UPDATE payload (op 0, t: "THREAD_MEMBERS_UPDATE")
 * Sent when members are added/removed from a thread (requires GuildMembers privileged intent)
 */
export function buildThreadMembersUpdatePayload(options: ThreadMembersUpdatePayloadOptions): GatewayPayload {
	const { threadId, guildId, memberCount, addedMembers, removedMemberIds, sequence } = options

	const data: Record<string, unknown> = {
		id: threadId,
		guild_id: guildId,
		member_count: memberCount
	}

	if (addedMembers && addedMembers.length > 0) {
		data.added_members = addedMembers.map((member) => ({
			id: member.id,
			user_id: member.user_id,
			join_timestamp: member.join_timestamp,
			flags: member.flags
		}))
	}

	if (removedMemberIds && removedMemberIds.length > 0) {
		data.removed_member_ids = removedMemberIds
	}

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'THREAD_MEMBERS_UPDATE',
		d: data
	}
}

// ============================================================================
// Invite Conversion Functions
// ============================================================================

/**
 * Convert a MockInvite to API invite format (basic)
 */
export function mockInviteToAPIInvite(invite: MockInvite, state: SessionState): Record<string, unknown> {
	const guild = state.guilds.get(invite.guildId)
	const channel = state.channels.get(invite.channelId)
	const inviter = state.users.get(invite.inviterId)

	const result: Record<string, unknown> = {
		code: invite.code,
		channel: channel
			? {
					id: channel.id,
					name: channel.name,
					type: channel.type
				}
			: null
	}

	if (guild) {
		result.guild = {
			id: guild.id,
			name: guild.name,
			icon: null // We don't store guild icons
		}
	}

	if (inviter) {
		result.inviter = mockUserToAPIUser(inviter)
	}

	if (invite.targetType !== undefined) {
		result.target_type = invite.targetType
	}

	if (invite.targetUserId) {
		const targetUser = state.users.get(invite.targetUserId)
		if (targetUser) {
			result.target_user = mockUserToAPIUser(targetUser)
		}
	}

	if (invite.expiresAt) {
		result.expires_at = invite.expiresAt
	}

	return result
}

/**
 * Convert a MockInvite to API extended invite format (includes uses, max_uses, etc.)
 */
export function mockInviteToAPIExtendedInvite(invite: MockInvite, state: SessionState): Record<string, unknown> {
	const base = mockInviteToAPIInvite(invite, state)

	return {
		...base,
		uses: invite.uses,
		max_uses: invite.maxUses,
		max_age: invite.maxAge,
		temporary: invite.temporary,
		created_at: invite.createdAt
	}
}

// ============================================================================
// Invite Gateway Event Payload Builders
// ============================================================================

/**
 * Options for building an INVITE_CREATE payload
 */
export interface InviteCreatePayloadOptions {
	invite: MockInvite
	state: SessionState
	sequence: number
}

/**
 * Build an INVITE_CREATE payload
 *
 * @see https://discord.com/developers/docs/events/gateway-events#invite-create
 */
export function buildInviteCreatePayload(options: InviteCreatePayloadOptions): GatewayPayload {
	const { invite, state, sequence } = options
	const inviter = state.users.get(invite.inviterId)

	const data: Record<string, unknown> = {
		channel_id: invite.channelId,
		code: invite.code,
		created_at: invite.createdAt,
		guild_id: invite.guildId,
		max_age: invite.maxAge,
		max_uses: invite.maxUses,
		temporary: invite.temporary,
		uses: invite.uses
	}

	if (inviter) {
		data.inviter = mockUserToAPIUser(inviter)
	}

	if (invite.targetType !== undefined) {
		data.target_type = invite.targetType
	}

	if (invite.targetUserId) {
		const targetUser = state.users.get(invite.targetUserId)
		if (targetUser) {
			data.target_user = mockUserToAPIUser(targetUser)
		}
	}

	// Note: target_application is not currently supported in MockInvite

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'INVITE_CREATE',
		d: data
	}
}

/**
 * Options for building an INVITE_DELETE payload
 */
export interface InviteDeletePayloadOptions {
	invite: MockInvite
	sequence: number
}

/**
 * Build an INVITE_DELETE payload
 *
 * @see https://discord.com/developers/docs/events/gateway-events#invite-delete
 */
export function buildInviteDeletePayload(options: InviteDeletePayloadOptions): GatewayPayload {
	const { invite, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'INVITE_DELETE',
		d: {
			channel_id: invite.channelId,
			code: invite.code,
			guild_id: invite.guildId
		}
	}
}

// ============================================================================
// Scheduled Event Payload Builders
// ============================================================================

/**
 * Convert a MockScheduledEvent to API format
 */
export function mockScheduledEventToAPIScheduledEvent(
	event: MockScheduledEvent,
	state?: SessionState,
	includeUserCount?: boolean
): Record<string, unknown> {
	const result: Record<string, unknown> = {
		id: event.id,
		guild_id: event.guildId,
		channel_id: event.channelId,
		creator_id: event.creatorId,
		name: event.name,
		description: event.description,
		scheduled_start_time: event.scheduledStartTime,
		scheduled_end_time: event.scheduledEndTime,
		privacy_level: event.privacyLevel,
		status: event.status,
		entity_type: event.entityType,
		entity_id: event.entityId,
		entity_metadata: event.entityMetadata,
		image: event.image
	}

	if (state && event.creatorId) {
		const creator = state.users.get(event.creatorId)
		if (creator) {
			result.creator = mockUserToAPIUser(creator)
		}
	}

	if (includeUserCount) {
		result.user_count = event.subscribers.size
	}

	return result
}

/**
 * Options for building a GUILD_SCHEDULED_EVENT_CREATE payload
 */
export interface GuildScheduledEventCreatePayloadOptions {
	event: MockScheduledEvent
	state?: SessionState
	sequence: number
}

/**
 * Build a GUILD_SCHEDULED_EVENT_CREATE payload
 */
export function buildGuildScheduledEventCreatePayload(options: GuildScheduledEventCreatePayloadOptions): GatewayPayload {
	const { event, state, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'GUILD_SCHEDULED_EVENT_CREATE',
		d: mockScheduledEventToAPIScheduledEvent(event, state, true)
	}
}

/**
 * Options for building a GUILD_SCHEDULED_EVENT_UPDATE payload
 */
export interface GuildScheduledEventUpdatePayloadOptions {
	event: MockScheduledEvent
	state?: SessionState
	sequence: number
}

/**
 * Build a GUILD_SCHEDULED_EVENT_UPDATE payload
 */
export function buildGuildScheduledEventUpdatePayload(options: GuildScheduledEventUpdatePayloadOptions): GatewayPayload {
	const { event, state, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'GUILD_SCHEDULED_EVENT_UPDATE',
		d: mockScheduledEventToAPIScheduledEvent(event, state, true)
	}
}

/**
 * Options for building a GUILD_SCHEDULED_EVENT_DELETE payload
 */
export interface GuildScheduledEventDeletePayloadOptions {
	event: MockScheduledEvent
	state?: SessionState
	sequence: number
}

/**
 * Build a GUILD_SCHEDULED_EVENT_DELETE payload
 */
export function buildGuildScheduledEventDeletePayload(options: GuildScheduledEventDeletePayloadOptions): GatewayPayload {
	const { event, state, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'GUILD_SCHEDULED_EVENT_DELETE',
		d: mockScheduledEventToAPIScheduledEvent(event, state)
	}
}

/**
 * Options for building a GUILD_SCHEDULED_EVENT_USER_ADD payload
 */
export interface GuildScheduledEventUserAddPayloadOptions {
	guildId: Snowflake
	eventId: Snowflake
	userId: Snowflake
	sequence: number
}

/**
 * Build a GUILD_SCHEDULED_EVENT_USER_ADD payload
 */
export function buildGuildScheduledEventUserAddPayload(options: GuildScheduledEventUserAddPayloadOptions): GatewayPayload {
	const { guildId, eventId, userId, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'GUILD_SCHEDULED_EVENT_USER_ADD',
		d: {
			guild_scheduled_event_id: eventId,
			user_id: userId,
			guild_id: guildId
		}
	}
}

/**
 * Options for building a GUILD_SCHEDULED_EVENT_USER_REMOVE payload
 */
export interface GuildScheduledEventUserRemovePayloadOptions {
	guildId: Snowflake
	eventId: Snowflake
	userId: Snowflake
	sequence: number
}

/**
 * Build a GUILD_SCHEDULED_EVENT_USER_REMOVE payload
 */
export function buildGuildScheduledEventUserRemovePayload(options: GuildScheduledEventUserRemovePayloadOptions): GatewayPayload {
	const { guildId, eventId, userId, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'GUILD_SCHEDULED_EVENT_USER_REMOVE',
		d: {
			guild_scheduled_event_id: eventId,
			user_id: userId,
			guild_id: guildId
		}
	}
}

// ============================================================================
// Auto-Moderation Payload Builders
// ============================================================================

/**
 * Convert a MockAutoModRule to API format
 */
export function mockAutoModRuleToAPIAutoModRule(rule: MockAutoModRule): Record<string, unknown> {
	return {
		id: rule.id,
		guild_id: rule.guildId,
		name: rule.name,
		creator_id: rule.creatorId,
		event_type: rule.eventType,
		trigger_type: rule.triggerType,
		trigger_metadata: {
			keyword_filter: rule.triggerMetadata.keywordFilter,
			regex_patterns: rule.triggerMetadata.regexPatterns,
			presets: rule.triggerMetadata.presets,
			allow_list: rule.triggerMetadata.allowList,
			mention_total_limit: rule.triggerMetadata.mentionTotalLimit,
			mention_raid_protection_enabled: rule.triggerMetadata.mentionRaidProtectionEnabled
		},
		actions: rule.actions.map((action) => ({
			type: action.type,
			metadata: action.metadata
				? {
						channel_id: action.metadata.channelId,
						duration_seconds: action.metadata.durationSeconds,
						custom_message: action.metadata.customMessage
					}
				: undefined
		})),
		enabled: rule.enabled,
		exempt_roles: rule.exemptRoles,
		exempt_channels: rule.exemptChannels
	}
}

/**
 * Options for building an AUTO_MODERATION_RULE_CREATE payload
 */
export interface AutoModerationRuleCreatePayloadOptions {
	rule: MockAutoModRule
	sequence: number
}

/**
 * Build an AUTO_MODERATION_RULE_CREATE payload
 */
export function buildAutoModerationRuleCreatePayload(options: AutoModerationRuleCreatePayloadOptions): GatewayPayload {
	const { rule, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'AUTO_MODERATION_RULE_CREATE',
		d: mockAutoModRuleToAPIAutoModRule(rule)
	}
}

/**
 * Options for building an AUTO_MODERATION_RULE_UPDATE payload
 */
export interface AutoModerationRuleUpdatePayloadOptions {
	rule: MockAutoModRule
	sequence: number
}

/**
 * Build an AUTO_MODERATION_RULE_UPDATE payload
 */
export function buildAutoModerationRuleUpdatePayload(options: AutoModerationRuleUpdatePayloadOptions): GatewayPayload {
	const { rule, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'AUTO_MODERATION_RULE_UPDATE',
		d: mockAutoModRuleToAPIAutoModRule(rule)
	}
}

/**
 * Options for building an AUTO_MODERATION_RULE_DELETE payload
 */
export interface AutoModerationRuleDeletePayloadOptions {
	rule: MockAutoModRule
	sequence: number
}

/**
 * Build an AUTO_MODERATION_RULE_DELETE payload
 */
export function buildAutoModerationRuleDeletePayload(options: AutoModerationRuleDeletePayloadOptions): GatewayPayload {
	const { rule, sequence } = options

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'AUTO_MODERATION_RULE_DELETE',
		d: mockAutoModRuleToAPIAutoModRule(rule)
	}
}

/**
 * Options for building an AUTO_MODERATION_ACTION_EXECUTION payload
 */
export interface AutoModerationActionExecutionPayloadOptions {
	guildId: Snowflake
	action: MockAutoModAction
	ruleId: Snowflake
	ruleTriggerType: AutoModerationTriggerType
	userId: Snowflake
	channelId?: Snowflake
	messageId?: Snowflake
	alertSystemMessageId?: Snowflake
	content: string
	matchedKeyword: string | null
	matchedContent: string | null
	sequence: number
}

/**
 * Build an AUTO_MODERATION_ACTION_EXECUTION payload
 */
export function buildAutoModerationActionExecutionPayload(options: AutoModerationActionExecutionPayloadOptions): GatewayPayload {
	const { guildId, action, ruleId, ruleTriggerType, userId, channelId, messageId, alertSystemMessageId, content, matchedKeyword, matchedContent, sequence } = options

	const data: Record<string, unknown> = {
		guild_id: guildId,
		action: {
			type: action.type,
			metadata: action.metadata
				? {
						channel_id: action.metadata.channelId,
						duration_seconds: action.metadata.durationSeconds,
						custom_message: action.metadata.customMessage
					}
				: undefined
		},
		rule_id: ruleId,
		rule_trigger_type: ruleTriggerType,
		user_id: userId,
		content,
		matched_keyword: matchedKeyword,
		matched_content: matchedContent
	}

	if (channelId) data.channel_id = channelId
	if (messageId) data.message_id = messageId
	if (alertSystemMessageId) data.alert_system_message_id = alertSystemMessageId

	return {
		op: GatewayOpcodes.Dispatch,
		s: sequence,
		t: 'AUTO_MODERATION_ACTION_EXECUTION',
		d: data
	}
}
