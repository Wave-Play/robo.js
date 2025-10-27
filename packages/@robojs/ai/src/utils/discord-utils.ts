/** Discord utility helpers for chunking messages, mocking interactions, and mention handling. */
import { ApplicationCommandType, ChatInputCommandInteraction, InteractionType, Message } from 'discord.js'
import { client, logger } from 'robo.js'
import type {
	APIInteraction,
	APIMessage,
	GuildMember,
	GuildMemberFlags,
	InteractionReplyOptions,
	TextBasedChannel,
	User
} from 'discord.js'
import type {
	GuildTextBasedChannel,
	InteractionDeferReplyOptions,
	InteractionEditReplyOptions,
	Locale,
	MessagePayload,
	Role
} from 'discord.js'
import type { CommandOption } from 'robo.js'

/** Lifecycle callbacks invoked during the mock interaction flow. */
interface MockInteractionCallbacks {
	onDeferred?: (options?: InteractionDeferReplyOptions) => Promise<void> | void
}

/** Configuration for mock interactions including callbacks and command metadata. */
interface MockInteractionOptions {
	callbacks?: MockInteractionCallbacks
	commandOptions?: readonly CommandOption[] | null
}

/** Type guard to check whether a channel is a guild text channel. */
function isGuildTextChannel(channel: TextBasedChannel | null | undefined): channel is GuildTextBasedChannel {
	return Boolean(channel && 'guild' in channel)
}

/** Discord message character limit (in characters). */
const CHAR_LIMIT = 2000

/**
 * Splits a message into Discord-safe chunks (≤2000 characters) by respecting paragraph and word
 * boundaries to preserve readability.
 */
export function chunkMessage(message: string): string[] {
	const chunks: string[] = []
	let tempStr = ''

	// Split into paragraphs for natural breaks
	const paragraphs = message.split('\n\n')

	for (let i = 0; i < paragraphs.length; i++) {
		const paragraph = paragraphs[i]
		const words = paragraph.split(' ')

		// Process each word in the paragraph
		for (const word of words) {
			// Push chunk if adding word would exceed limit
			if ((tempStr + word).length + 1 > CHAR_LIMIT) {
				chunks.push(tempStr.trim())
				tempStr = ''
			}

			tempStr += word + ' '
		}

		// Check if next paragraph fits with current chunk
		if (i < paragraphs.length - 1 && (tempStr + '\n\n' + paragraphs[i + 1]).length > CHAR_LIMIT) {
			chunks.push(tempStr.trim())
			tempStr = ''
		} else if (i < paragraphs.length - 1) {
			tempStr += '\n\n'
		}
	}

	// Add any remaining content
	if (tempStr.trim().length > 0) {
		chunks.push(tempStr.trim())
	}

	return chunks.filter(Boolean)
}

/** Command option types that resolve to guild members. */
const MEMBER_OPTION_TYPES = new Set(['member', 'user', 'mention'])
/** Maximum number of members fetched when searching by text. */
const MEMBER_SEARCH_LIMIT = 5

/** Removes Discord mention characters from a string. */
const stripMentionFormatting = (value: string) => value.replace(/[<@!>#]/g, '')
/** Normalizes a member lookup string for fuzzy matching. */
const normalizeMemberLookupKey = (value: string) =>
	stripMentionFormatting(value)
		.trim()
		.replace(/^[!@#]+/, '')
		.replace(/[.,!?`'"\\]/g, '')
		.replace(/\s+/g, ' ')
		.toLowerCase()

/**
 * Creates a mock ChatInputCommandInteraction for programmatic command execution with option
 * resolution, member searches, and reply tracking.
 */
export async function mockInteraction(
	channel: TextBasedChannel | null | undefined,
	member: GuildMember | null | undefined,
	args: Record<string, string>,
	options?: MockInteractionOptions
) {
	// Create a mock CommandInteraction to pass to the function handler
	let interationMemberData: APIInteraction['member'] = undefined

	// Construct API member data from guild member
	if (member) {
		interationMemberData = {
			user: {
				id: member.user.id,
				username: member.user.username,
				discriminator: member.user.discriminator,
				global_name: member.user.username,
				avatar: member.user.avatar
			},
			flags: (member?.flags ?? 0) as unknown as GuildMemberFlags,
			roles: member?.roles?.cache?.map((role) => role.id) ?? [],
			premium_since: member?.premiumSince?.toISOString() ?? null,
			permissions: member?.permissions?.bitfield?.toString() ?? '',
			pending: member?.pending ?? false,
			nick: member?.nickname,
			mute: false,
			joined_at: member?.joinedAt?.toISOString() ?? '',
			deaf: false
		}
	}
	// Build mock interaction data structure
	const interactionData = {
		id: Date.now().toString(),
		application_id: client.user?.id ?? 'mock',
		type: InteractionType.ApplicationCommand,
		app_permissions: member?.permissions?.bitfield?.toString() ?? '',
		channel: {
			id: channel?.id ?? '',
			type: channel?.type ?? 0
		},
		data: {
			type: ApplicationCommandType.ChatInput,
			name: 'mock',
			id: 'mock'
		},
		entitlements: [],
		guild_id: member?.guild?.id,
		channel_id: channel?.id ?? '',
		locale: 'en-US' as Locale,
		member: interationMemberData,
		token: 'mock', // This should be a valid interaction token, but there's no way to mock this
		version: 1
	} as unknown as APIInteraction

	// @ts-expect-error - Mock
	const interaction: ChatInputCommandInteraction = new ChatInputCommandInteraction(client, interactionData)

	const callbacks = options?.callbacks
	const commandOptions = options?.commandOptions ?? []

	// Index command options for validation
	const optionDefinitions = new Map<string, CommandOption>()
	for (const option of commandOptions) {
		optionDefinitions.set(option.name, option)
	}

	// Track deferral and reply state
	let deferred = false
	let replied = false
	let deferredOptions: InteractionDeferReplyOptions | undefined
	const guild = member?.guild ?? (isGuildTextChannel(channel) ? channel.guild : undefined)
	const normalizedArgs = new Map<string, string>(Object.entries(args ?? {}))
	// Define boolean value mappings
	const truthy = new Set(['1', 'true', 't', 'yes', 'y', 'on', 'enable', 'enabled'])
	const falsy = new Set(['0', 'false', 'f', 'no', 'n', 'off', 'disable', 'disabled'])

	const getRaw = (key: string) => {
		return normalizedArgs.get(key)
	}

	// Validate resolved values against choice constraints
	const enforceChoice = <T>(key: string, resolved: T, raw: string | undefined): T => {
		const definition = optionDefinitions.get(key)
		if (!definition?.choices?.length) {
			return resolved
		}
		const allowed = definition.choices.map((choice) => choice.value)
		const matches = allowed.some((allowedValue) => {
			if (typeof allowedValue === typeof resolved) {
				return allowedValue === resolved
			}
			if (typeof resolved === 'number') {
				const parsed = typeof allowedValue === 'string' ? Number(allowedValue) : Number.NaN

				return !Number.isNaN(parsed) && parsed === resolved
			}
			if (typeof resolved === 'string') {
				return String(allowedValue) === resolved
			}

			return false
		})
		if (matches) {
			return resolved
		}
		const list = allowed.map((value) => `"${value}"`).join(', ')
		throw new Error(`Option "${key}" must be one of: ${list}${raw ? `; received "${raw}"` : ''}`)
	}

	// Cache member/user resolutions for performance
	const preResolvedMembersByOption = new Map<string, GuildMember | null>()
	const preResolvedUsersByOption = new Map<string, User | null>()
	const preResolvedMembersByValue = new Map<string, GuildMember | null>()
	const preResolvedUsersByValue = new Map<string, User | null>()

	const registerResolvedMember = (raw: string, optionName: string | null, resolved: GuildMember | null) => {
		if (optionName) {
			preResolvedMembersByOption.set(optionName, resolved)
			preResolvedUsersByOption.set(optionName, resolved?.user ?? null)
		}

		if (raw) {
			preResolvedMembersByValue.set(raw, resolved)
			preResolvedUsersByValue.set(raw, resolved?.user ?? null)
		}

		const normalizedKey = raw ? normalizeMemberLookupKey(raw) : ''
		if (normalizedKey) {
			preResolvedMembersByValue.set(normalizedKey, resolved)
			preResolvedUsersByValue.set(normalizedKey, resolved?.user ?? null)
		}

		if (resolved) {
			preResolvedMembersByValue.set(resolved.id, resolved)
			preResolvedUsersByValue.set(resolved.id, resolved.user)
		}
	}

	// Perform async member search with fallbacks
	const resolveMemberWithSearch = async (value: string | undefined): Promise<GuildMember | null> => {
		if (!value || !guild) {
			return null
		}

		const id = value.match(/\d{17,20}/)?.[0]
		if (id) {
			const cached = guild.members.cache.get(id)
			if (cached) {
				return cached
			}

			try {
				const fetched = await guild.members.fetch(id)
				if (fetched) {
					return fetched
				}
			} catch (error) {
				logger.debug('Failed to fetch guild member by id for mock interaction', {
					error,
					guildId: guild.id,
					id
				})
			}
		}

		const cleaned = stripMentionFormatting(value).trim()
		const normalized = normalizeMemberLookupKey(value)
		if (!normalized) {
			return null
		}

		const cached =
			guild.members.cache.find((candidate) => {
				return (
					normalizeMemberLookupKey(candidate.user.username) === normalized ||
					(candidate.displayName && normalizeMemberLookupKey(candidate.displayName) === normalized) ||
					(candidate.user.globalName && normalizeMemberLookupKey(candidate.user.globalName) === normalized)
				)
			}) ?? null
		if (cached) {
			return cached
		}

		const executeSearch = async () => {
			if (typeof guild.members.search === 'function') {
				return guild.members.search({ query: cleaned, limit: MEMBER_SEARCH_LIMIT })
			}
			if (typeof guild.members.fetch === 'function') {
				return guild.members.fetch({ query: cleaned, limit: MEMBER_SEARCH_LIMIT })
			}
			return null
		}

		try {
			const results = await executeSearch()
			if (!results) {
				return null
			}

			const exact =
				results.find((candidate) => {
					return (
						normalizeMemberLookupKey(candidate.user.username) === normalized ||
						(candidate.displayName && normalizeMemberLookupKey(candidate.displayName) === normalized) ||
						(candidate.user.globalName && normalizeMemberLookupKey(candidate.user.globalName) === normalized)
					)
				}) ?? results.first()

			return exact ?? null
		} catch (error) {
			logger.debug('Guild member search fallback failed for mock interaction', {
				error,
				guildId: guild?.id,
				query: cleaned
			})
			return null
		}
	}

	if (commandOptions.length && guild) {
		// Pre-resolve member options before interaction creation
		const relevantOptions = commandOptions.filter((option) => {
			const type = option.type ?? 'string'
			return MEMBER_OPTION_TYPES.has(type)
		})

		await Promise.all(
			relevantOptions.map(async (option) => {
				const raw = normalizedArgs.get(option.name)
				if (!raw) {
					registerResolvedMember('', option.name, null)
					return
				}
				const resolved = await resolveMemberWithSearch(raw)
				registerResolvedMember(raw, option.name, resolved)
			})
		)
	}

	const handleMissing = <T>(key: string, required?: boolean): T | null => {
		if (required) {
			throw new Error(`Required option "${key}" is missing`)
		}
		return null
	}
	const extractId = (value: string) => value.match(/\d{17,20}/)?.[0]
	const resolveMember = (value: string | undefined) => {
		if (!value) {
			return null
		}
		const normalizedKey = normalizeMemberLookupKey(value)
		if (preResolvedMembersByValue.has(value)) {
			return preResolvedMembersByValue.get(value) ?? null
		}
		if (preResolvedMembersByValue.has(normalizedKey)) {
			return preResolvedMembersByValue.get(normalizedKey) ?? null
		}
		const id = extractId(value)
		if (id) {
			const cached = guild?.members.cache.get(id)
			if (cached) {
				return cached
			}
		}
		const cleaned = normalizedKey
		return (
			guild?.members.cache.find((candidate) => {
				if (!cleaned) {
					return false
				}
				if (normalizeMemberLookupKey(candidate.user.username) === cleaned) {
					return true
				}
				if (candidate.displayName && normalizeMemberLookupKey(candidate.displayName) === cleaned) {
					return true
				}
				if (candidate.user.globalName && normalizeMemberLookupKey(candidate.user.globalName) === cleaned) {
					return true
				}
				return false
			}) ?? null
		)
	}
	const resolveUser = (value: string | undefined) => {
		const memberResult = resolveMember(value)
		if (memberResult) {
			return memberResult.user
		}
		if (!value) {
			return null
		}
		const normalizedKey = normalizeMemberLookupKey(value)
		if (preResolvedUsersByValue.has(value)) {
			return preResolvedUsersByValue.get(value) ?? null
		}
		if (preResolvedUsersByValue.has(normalizedKey)) {
			return preResolvedUsersByValue.get(normalizedKey) ?? null
		}
		const id = extractId(value)
		if (id) {
			return client.users.cache.get(id) ?? null
		}
		return null
	}
	const resolveRole = (value: string | undefined): Role | null => {
		if (!value) {
			return null
		}
		const id = extractId(value)
		if (id) {
			const cached = guild?.roles.cache.get(id)
			if (cached) {
				return cached
			}
		}
		const cleaned = value.replace('@', '').toLowerCase()
		return guild?.roles.cache.find((candidate) => candidate.name.toLowerCase() === cleaned) ?? null
	}
	const resolveChannel = (value: string | undefined) => {
		if (!value) {
			return null
		}
		const id = extractId(value)
		if (id) {
			const cached = guild?.channels.cache.get(id) ?? client.channels.cache.get(id)
			if (cached) {
				return cached
			}
		}
		const cleaned = value.replace('#', '').toLowerCase()
		return (
			guild?.channels.cache.find((candidate) => {
				return 'name' in candidate && candidate.name?.toLowerCase() === cleaned
			}) ?? null
		)
	}
	const resolveMentionable = (value: string | undefined) => {
		return resolveMember(value) ?? resolveRole(value) ?? resolveUser(value)
	}
	const resolveReply = (
		input: string | MessagePayload | InteractionReplyOptions | InteractionEditReplyOptions
	): string | InteractionReplyOptions => {
		if (typeof input === 'string') {
			return input
		}
		return input as InteractionReplyOptions
	}

	// Build option resolver with type-specific getters
	const optionResolver = {
		get(key: string) {
			const raw = getRaw(key)
			if (raw === undefined) {
				return null
			}

			return {
				name: key,
				value: raw,
				get channel() {
					return resolveChannel(raw)
				},
				get member() {
					if (preResolvedMembersByOption.has(key)) {
						return preResolvedMembersByOption.get(key) ?? null
					}
					return resolveMember(raw)
				},
				get role() {
					return resolveRole(raw)
				},
				get user() {
					if (preResolvedUsersByOption.has(key)) {
						return preResolvedUsersByOption.get(key) ?? null
					}
					return resolveUser(raw)
				}
			}
		},
		getAttachment(key: string, required?: boolean) {
			return handleMissing(key, required)
		},
		getBoolean(key: string, required?: boolean) {
			const raw = getRaw(key)
			if (raw === undefined) {
				return handleMissing(key, required)
			}
			const normalized = raw.trim().toLowerCase()
			if (truthy.has(normalized)) {
				return enforceChoice(key, true, raw)
			}
			if (falsy.has(normalized)) {
				return enforceChoice(key, false, raw)
			}
			throw new Error(`Option "${key}" requires a boolean value, received "${raw}"`)
		},
		getChannel(key: string, required?: boolean) {
			const raw = getRaw(key)
			if (raw === undefined) {
				return handleMissing(key, required)
			}
			const resolved = resolveChannel(raw)
			if (!resolved) {
				return handleMissing(key, required)
			}
			return resolved
		},
		getInteger(key: string, required?: boolean) {
			const raw = getRaw(key)
			if (raw === undefined) {
				return handleMissing<number>(key, required)
			}
			const parsed = Number.parseInt(raw, 10)
			if (Number.isNaN(parsed)) {
				throw new Error(`Option "${key}" requires an integer value, received "${raw}"`)
			}
			return enforceChoice(key, parsed, raw)
		},
		getMember(key: string, required?: boolean) {
			const raw = getRaw(key)
			if (raw === undefined) {
				return handleMissing(key, required)
			}
			const resolved = resolveMember(raw)
			if (!resolved) {
				return handleMissing(key, required)
			}
			return resolved
		},
		getMentionable(key: string, required?: boolean) {
			const raw = getRaw(key)
			if (raw === undefined) {
				return handleMissing(key, required)
			}
			const resolved = resolveMentionable(raw)
			if (!resolved) {
				return handleMissing(key, required)
			}
			return resolved
		},
		getNumber(key: string, required?: boolean) {
			const raw = getRaw(key)
			if (raw === undefined) {
				return handleMissing<number>(key, required)
			}
			const parsed = Number.parseFloat(raw)
			if (Number.isNaN(parsed)) {
				throw new Error(`Option "${key}" requires a number, received "${raw}"`)
			}
			return enforceChoice(key, parsed, raw)
		},
		getRole(key: string, required?: boolean) {
			const raw = getRaw(key)
			if (raw === undefined) {
				return handleMissing(key, required)
			}
			const resolved = resolveRole(raw)
			if (!resolved) {
				return handleMissing(key, required)
			}
			return resolved
		},
		getString(key: string, required?: boolean) {
			const raw = getRaw(key)
			if (raw === undefined) {
				return handleMissing(key, required)
			}
			return enforceChoice(key, raw, raw)
		},
		getUser(key: string, required?: boolean) {
			const raw = getRaw(key)
			if (raw === undefined) {
				return handleMissing(key, required)
			}
			const resolved = resolveUser(raw)
			if (!resolved) {
				return handleMissing(key, required)
			}
			return resolved as User
		}
	}
	;(interaction as unknown as { options: typeof optionResolver }).options = optionResolver

	let replyResolve: (content: string | InteractionReplyOptions) => void
	const replyPromise = new Promise<string | InteractionReplyOptions>((resolve) => {
		replyResolve = resolve
	})
	// Mock deferReply to track deferral state
	// @ts-expect-error - Mock
	interaction.deferReply = async (options?: InteractionDeferReplyOptions) => {
		deferred = true
		deferredOptions = options
		;(interaction as unknown as { deferred: boolean; deferredOptions?: InteractionDeferReplyOptions }).deferred = true
		;(interaction as unknown as { deferred: boolean; deferredOptions?: InteractionDeferReplyOptions }).deferredOptions =
			options
		await callbacks?.onDeferred?.(options)
		return mockMessage('', channel)
	}
	// Mock reply handlers to capture responses
	const replyHandler = async (content: string | MessagePayload | InteractionReplyOptions) => {
		const resolved = resolveReply(content)
		replyResolve(resolved)
		replied = true
		;(interaction as unknown as { replied: boolean }).replied = true
		return mockMessage(resolved, channel)
	}
	interaction.reply = replyHandler as unknown as typeof interaction.reply
	const editReplyHandler = async (content: string | MessagePayload | InteractionEditReplyOptions) => {
		const resolved = resolveReply(content)
		replyResolve(resolved)
		replied = true
		;(interaction as unknown as { replied: boolean }).replied = true
		return mockMessage(resolved, channel)
	}
	interaction.editReply = editReplyHandler as unknown as typeof interaction.editReply

	return {
		interaction,
		replyPromise,
		wasDeferred: () => deferred,
		wasReplied: () => replied,
		getDeferredOptions: () => deferredOptions
	}
}

/** Creates a mock Discord message for testing or simulated replies. */
export function mockMessage(
	content: string | InteractionReplyOptions,
	channel: TextBasedChannel | null | undefined
): Message {
	// Construct API message data structure
	const messageData: APIMessage = {
		id: Date.now().toString(),
		type: 0,
		channel_id: channel?.id ?? '',
		content: typeof content === 'string' ? content : (content.content ?? ''),
		timestamp: new Date().toISOString(),
		edited_timestamp: null,
		tts: false,
		mention_everyone: false,
		mention_roles: [],
		mentions: [],
		pinned: false,
		attachments: [],
		embeds: [],
		author: {
			id: client.user?.id ?? 'mock',
			username: client.user?.username ?? 'mock',
			discriminator: client.user?.discriminator ?? '0',
			global_name: client.user?.username ?? 'mock',
			avatar: client.user?.avatar ?? 'mock'
		}
	}

	// @ts-expect-error - Private constructor
	return new Message(client, messageData)
}

/** Replaces @username mentions with Discord mention syntax using a provided mapping. */
export function replaceUsernamesWithIds(text: string, map: Record<string, string>): string {
	let result = ''
	let buffer = ''

	// Process each character to detect mention boundaries
	for (let i = 0; i < text.length; ++i) {
		if (text[i] === '@') {
			// Handle mention completion
			if (buffer in map) {
				result += `<@${map[buffer]}>`
			} else {
				result += buffer
			}
			buffer = ''
		} else if (text[i].match(/\b/)) {
			// Accumulate word characters
			buffer += text[i]
		} else {
			if (buffer in map) {
				result += `<@${map[buffer]}>`
			} else {
				result += buffer
			}
			buffer = text[i]
		}
	}

	// Process remaining buffer
	if (buffer in map) {
		result += `<@${map[buffer]}>`
	} else {
		result += buffer
	}

	return result
}
