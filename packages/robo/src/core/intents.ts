import { Client, GatewayIntentBits } from 'discord.js'
import { portal } from './robo.js'
import { discordLogger } from './constants.js'
import { bold } from './color.js'

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
	messageCreate: [...[GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages]],
	messageUpdate: [...[GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages]],
	messageDelete: [...[GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages]],
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

export function checkIntents(client: Client): void {
	const missingIntents = new Set<GatewayIntentBits>()
	const events = portal.events.keys() as string[]
	const intents = Number(client.options.intents.bitfield)

	for (const eventName of events) {
		const requiredBit = REQUIRED_INTENTS[eventName]
		if (!requiredBit) {
			continue // Skip custom events
		}

		if (Array.isArray(requiredBit)) {
			const hasAnyBit = requiredBit.some((bit) => (intents & bit) > 0)
			if (!hasAnyBit) {
				requiredBit.forEach((bit) => missingIntents.add(bit))
			}
		} else if ((intents & requiredBit) === 0) {
			missingIntents.add(requiredBit)
		}
	}

	if (missingIntents.size === 0) return

	const intentBitToName = Object.fromEntries(Object.entries(GatewayIntentBits).map(([key, value]) => [value, key]))

	const missingIntentNames = Array.from(missingIntents).map(
		(bit) => intentBitToName[bit as keyof typeof intentBitToName] ?? 'Unknown'
	)

	discordLogger.warn(`Missing intents: ${missingIntentNames.map((i) => bold(i)).join(', ')}`)
}
