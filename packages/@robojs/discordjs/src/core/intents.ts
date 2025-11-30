/**
 * Discord intent inference for @robojs/discordjs
 *
 * Analyzes registered events to determine required gateway intents
 * and warns about missing intents that could prevent events from firing.
 */
import { Client, GatewayIntentBits } from 'discord.js'
import { discordLogger } from './logger.js'

/**
 * Mapping of Discord event names to their required gateway intents.
 * Events may require a single intent or an array of possible intents.
 */
export const REQUIRED_INTENTS: Record<string, GatewayIntentBits | GatewayIntentBits[]> = {
	// Guild related events
	guildCreate: GatewayIntentBits.Guilds,
	guildUpdate: GatewayIntentBits.Guilds,
	guildDelete: GatewayIntentBits.Guilds,

	// Channel related events
	channelCreate: GatewayIntentBits.Guilds,
	channelUpdate: GatewayIntentBits.Guilds,
	channelDelete: GatewayIntentBits.Guilds,
	channelPinsUpdate: GatewayIntentBits.Guilds,

	// Thread related events
	threadCreate: GatewayIntentBits.Guilds,
	threadUpdate: GatewayIntentBits.Guilds,
	threadDelete: GatewayIntentBits.Guilds,
	threadListSync: GatewayIntentBits.Guilds,
	threadMemberUpdate: GatewayIntentBits.Guilds,
	threadMembersUpdate: GatewayIntentBits.GuildMembers,

	// Stage instance events
	stageInstanceCreate: GatewayIntentBits.Guilds,
	stageInstanceUpdate: GatewayIntentBits.Guilds,
	stageInstanceDelete: GatewayIntentBits.Guilds,

	// Member related events
	guildMemberAdd: GatewayIntentBits.GuildMembers,
	guildMemberUpdate: GatewayIntentBits.GuildMembers,
	guildMemberRemove: GatewayIntentBits.GuildMembers,

	// Moderation events
	guildAuditLogEntryCreate: GatewayIntentBits.GuildModeration,
	guildBanAdd: GatewayIntentBits.GuildModeration,
	guildBanRemove: GatewayIntentBits.GuildModeration,

	// Guild customization events
	guildEmojisUpdate: GatewayIntentBits.GuildEmojisAndStickers,
	guildStickersUpdate: GatewayIntentBits.GuildEmojisAndStickers,

	// Integration events
	guildIntegrationsUpdate: GatewayIntentBits.GuildIntegrations,
	integrationCreate: GatewayIntentBits.GuildIntegrations,
	integrationUpdate: GatewayIntentBits.GuildIntegrations,
	integrationDelete: GatewayIntentBits.GuildIntegrations,

	// Other guild events
	webhooksUpdate: GatewayIntentBits.GuildWebhooks,
	inviteCreate: GatewayIntentBits.GuildInvites,
	inviteDelete: GatewayIntentBits.GuildInvites,
	voiceStateUpdate: GatewayIntentBits.GuildVoiceStates,
	presenceUpdate: GatewayIntentBits.GuildPresences,

	// Message related events
	messageCreate: [GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
	messageUpdate: [GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
	messageDelete: [GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
	messageDeleteBulk: GatewayIntentBits.GuildMessages,

	// Reaction events
	messageReactionAdd: GatewayIntentBits.GuildMessageReactions,
	messageReactionRemove: GatewayIntentBits.GuildMessageReactions,
	messageReactionRemoveAll: GatewayIntentBits.GuildMessageReactions,
	messageReactionRemoveEmoji: GatewayIntentBits.GuildMessageReactions,

	// Typing events
	typingStart: GatewayIntentBits.GuildMessageTyping,

	// Scheduled events
	guildScheduledEventCreate: GatewayIntentBits.GuildScheduledEvents,
	guildScheduledEventUpdate: GatewayIntentBits.GuildScheduledEvents,
	guildScheduledEventDelete: GatewayIntentBits.GuildScheduledEvents,
	guildScheduledEventUserAdd: GatewayIntentBits.GuildScheduledEvents,
	guildScheduledEventUserRemove: GatewayIntentBits.GuildScheduledEvents,

	// Auto moderation events
	autoModerationRuleCreate: GatewayIntentBits.AutoModerationConfiguration,
	autoModerationRuleUpdate: GatewayIntentBits.AutoModerationConfiguration,
	autoModerationRuleDelete: GatewayIntentBits.AutoModerationConfiguration,
	autoModerationActionExecution: GatewayIntentBits.AutoModerationExecution,

	// Poll events
	messagePollVoteAdd: GatewayIntentBits.GuildMessagePolls,
	messagePollVoteRemove: GatewayIntentBits.GuildMessagePolls
}

/**
 * Reverse mapping from intent bits to their names.
 */
const intentBitToName = Object.fromEntries(
	Object.entries(GatewayIntentBits)
		.filter(([key]) => isNaN(Number(key)))
		.map(([key, value]) => [value, key])
)

/**
 * Check if the client has the required intents for registered events.
 * Logs warnings for any missing intents.
 *
 * @param client - Discord.js client instance
 * @param events - Map of event names to handler records
 */
export function checkIntents(client: Client, events: Record<string, unknown[]>): void {
	const missingIntents = new Set<GatewayIntentBits>()
	const eventNames = Object.keys(events)
	const intents = Number(client.options.intents.bitfield)

	for (const eventName of eventNames) {
		const requiredBit = REQUIRED_INTENTS[eventName]
		if (!requiredBit) {
			// Skip events that don't require specific intents (like ready, interactionCreate)
			continue
		}

		if (Array.isArray(requiredBit)) {
			// For events that can use multiple intents (e.g., messageCreate)
			// Check if at least one is present
			const hasAnyBit = requiredBit.some((bit) => (intents & bit) > 0)
			if (!hasAnyBit) {
				requiredBit.forEach((bit) => missingIntents.add(bit))
			}
		} else if ((intents & requiredBit) === 0) {
			missingIntents.add(requiredBit)
		}
	}

	if (missingIntents.size === 0) return

	const missingIntentNames = Array.from(missingIntents).map(
		(bit) => intentBitToName[bit as keyof typeof intentBitToName] ?? 'Unknown'
	)

	discordLogger.warn(`Missing intents: ${missingIntentNames.map((i) => `\x1b[1m${i}\x1b[0m`).join(', ')}`)
}

/**
 * Infer required intents from a list of event names.
 * Useful at build time for generating suggestions.
 *
 * @param eventNames - Array of event names
 * @returns Set of required GatewayIntentBits
 */
export function inferIntents(eventNames: string[]): Set<GatewayIntentBits> {
	const intents = new Set<GatewayIntentBits>()

	for (const eventName of eventNames) {
		const requiredBit = REQUIRED_INTENTS[eventName]
		if (!requiredBit) continue

		if (Array.isArray(requiredBit)) {
			// For events with multiple possible intents, add all of them
			// The user should configure which ones they actually need
			requiredBit.forEach((bit) => intents.add(bit))
		} else {
			intents.add(requiredBit)
		}
	}

	return intents
}

/**
 * Get intent names from a set of intent bits.
 *
 * @param intents - Set of GatewayIntentBits
 * @returns Array of intent names
 */
export function getIntentNames(intents: Set<GatewayIntentBits>): string[] {
	return Array.from(intents).map((bit) => intentBitToName[bit] ?? `Unknown(${bit})`)
}

/**
 * Validate that all required intents are present for given events.
 *
 * @param configuredIntents - Bitfield of configured intents
 * @param eventNames - Array of event names
 * @returns Object with validation result and details
 */
export function validateIntents(
	configuredIntents: number | bigint,
	eventNames: string[]
): {
	valid: boolean
	missing: string[]
	suggestions: string[]
} {
	const missing: string[] = []
	const suggestions: string[] = []
	const intents = Number(configuredIntents)

	for (const eventName of eventNames) {
		const requiredBit = REQUIRED_INTENTS[eventName]
		if (!requiredBit) continue

		if (Array.isArray(requiredBit)) {
			const hasAnyBit = requiredBit.some((bit) => (intents & bit) > 0)
			if (!hasAnyBit) {
				missing.push(eventName)
				const intentNames = requiredBit.map((bit) => intentBitToName[bit]).filter(Boolean)
				suggestions.push(`${eventName}: needs one of [${intentNames.join(', ')}]`)
			}
		} else if ((intents & requiredBit) === 0) {
			missing.push(eventName)
			const intentName = intentBitToName[requiredBit]
			if (intentName) {
				suggestions.push(`${eventName}: needs ${intentName}`)
			}
		}
	}

	return {
		valid: missing.length === 0,
		missing,
		suggestions
	}
}
