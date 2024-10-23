import { Client, GatewayIntentBits } from 'discord.js'
import { portal } from 'robo.js'

const REQUIRED_INTENTS: Record<string, GatewayIntentBits | GatewayIntentBits[]> = {
	guildCreate: GatewayIntentBits.Guilds,
	guildUpdate: GatewayIntentBits.Guilds,
	guildDelete: GatewayIntentBits.Guilds,
	channelCreate: GatewayIntentBits.Guilds,
	channelUpdate: GatewayIntentBits.Guilds,
	channelDelete: GatewayIntentBits.Guilds,
	channelPinsUpdate: GatewayIntentBits.Guilds,
	threadCreate: GatewayIntentBits.Guilds,
	threadUpdate: GatewayIntentBits.Guilds,
	threadDelete: GatewayIntentBits.Guilds,
	threadListSync: GatewayIntentBits.Guilds,
	threadMemberUpdate: GatewayIntentBits.Guilds,
	stageInstanceCreate: GatewayIntentBits.Guilds,
	stageInstanceUpdate: GatewayIntentBits.Guilds,
	stageInstanceDelete: GatewayIntentBits.Guilds,
	guildMemberAdd: GatewayIntentBits.GuildMembers,
	guildMemberUpdate: GatewayIntentBits.GuildMembers,
	guildMemberRemove: GatewayIntentBits.GuildMembers,
	threadMembersUpdate: GatewayIntentBits.GuildMembers,
	guildAuditLogEntryCreate: GatewayIntentBits.GuildModeration,
	guildBanAdd: GatewayIntentBits.GuildModeration,
	guildBanRemove: GatewayIntentBits.GuildModeration,
	guildEmojisUpdate: GatewayIntentBits.GuildEmojisAndStickers,
	guildStickersUpdate: GatewayIntentBits.GuildEmojisAndStickers,
	guildIntegrationsUpdate: GatewayIntentBits.GuildIntegrations,
	integrationCreate: GatewayIntentBits.GuildIntegrations,
	integrationUpdate: GatewayIntentBits.GuildIntegrations,
	integrationDelete: GatewayIntentBits.GuildIntegrations,
	webhooksUpdate: GatewayIntentBits.GuildWebhooks,
	inviteCreate: GatewayIntentBits.GuildInvites,
	inviteDelete: GatewayIntentBits.GuildInvites,
	voiceStateUpdate: GatewayIntentBits.GuildVoiceStates,
	presenceUpdate: GatewayIntentBits.GuildPresences,
	messageCreate: [GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
	messageUpdate: [GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
	messageDelete: [GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
	messageDeleteBulk: GatewayIntentBits.GuildMessages,
	messageReactionAdd: GatewayIntentBits.GuildMessageReactions,
	messageReactionRemove: GatewayIntentBits.GuildMessageReactions,
	messageReactionRemoveAll: GatewayIntentBits.GuildMessageReactions,
	messageReactionRemoveEmoji: GatewayIntentBits.GuildMessageReactions,
	typingStart: GatewayIntentBits.GuildMessageTyping,
	guildScheduledEventCreate: GatewayIntentBits.GuildScheduledEvents,
	guildScheduledEventUpdate: GatewayIntentBits.GuildScheduledEvents,
	guildScheduledEventDelete: GatewayIntentBits.GuildScheduledEvents,
	guildScheduledEventUserAdd: GatewayIntentBits.GuildScheduledEvents,
	guildScheduledEventUserRemove: GatewayIntentBits.GuildScheduledEvents,
	autoModerationRuleCreate: GatewayIntentBits.AutoModerationConfiguration,
	autoModerationRuleUpdate: GatewayIntentBits.AutoModerationConfiguration,
	autoModerationRuleDelete: GatewayIntentBits.AutoModerationConfiguration,
	autoModerationActionExecution: GatewayIntentBits.AutoModerationExecution
	// Not in DJS, listed on discord api
	// https://discord.com/developers/docs/topics/gateway#gateway-intents
	// 'messagePollVoteAdd': GatewayIntentBits.GuildMessagePolls,
	// 'messagePollVoteRemove': GatewayIntentBits.GuildMessagePolls
}

export default (client: Client) => {
	// Sets ensure that each element is unique
	const missingIntents = new Set()
	const events = portal.events.keys() as string[]

	// Here we extract the client.intents bitfield, this is normally unaccessible to a user so it's a little funky
	// The Number() function converts the bigint to a floating point number, the default of NodeJS
	const intents = Number(client.options.intents.bitfield)

	// Loop through every event set by client.on(...)
	for (const eventName of events) {
		// Lookup the required intent(s) for the event
		const requiredBit = REQUIRED_INTENTS[eventName]
		if (!requiredBit) continue // custom event
		// Some bitwise operations lol
		if (Array.isArray(requiredBit)) {
			// If it's an array then we need to check if any of the bits are set
			// If none of the bits are set then we need to log it
			const hasAnyBit = requiredBit.some((bit) => (intents & bit) > 0)
			if (!hasAnyBit) {
				// Add all the bits to the set
				for (const bit of requiredBit) {
					missingIntents.add(bit)
				}
			}
			continue
		} else if ((intents & requiredBit) === 0) {
			// If the bit is not set then we need to log it
			missingIntents.add(requiredBit)
		}
	}

	// If you have every intent then we don't need to log anything
	if (missingIntents.size === 0) return

	// This is just a fancy way of flipping the object so we can lookup the name of the intent by the bit
	// { 'Guilds': 1, 'GuildMembers': 2 } -> { 1: 'Guilds', 2: 'GuildMembers' }
	const EventNames = Object.fromEntries(Object.entries(GatewayIntentBits).map(([key, value]) => [value, key])) // flip key and value for faster lookup
	// Convert it to an array so we can
	const missingIntentNames = Array.from(missingIntents).map((bit) => {
		return EventNames[bit as string] ?? 'unknown'
	})
	console.error(`Missing intents: ${missingIntentNames.join(', ')}`)
}
