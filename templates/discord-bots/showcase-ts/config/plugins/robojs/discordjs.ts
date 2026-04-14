import type { DiscordConfig } from '@robojs/discordjs'

export default {
	clientOptions: {
		intents: ['Guilds', 'GuildMessages', 'GuildMembers', 'MessageContent']
	},
	prefix: {
		value: '!',
		caseSensitive: false,
		ignoreBots: true,
		mentionAsPrefix: false
	}
} satisfies DiscordConfig
