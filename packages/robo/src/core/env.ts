import { loadEnv } from './dotenv.js'
loadEnv({ sync: true })

export const env = {
	discord: {
		clientId: process.env.DISCORD_CLIENT_ID,
		debugChannelId: process.env.DISCORD_DEBUG_CHANNEL_ID,
		guildId: process.env.DISCORD_GUILD_ID,
		token: process.env.DISCORD_TOKEN
	},
	nodeEnv: process.env.NODE_ENV,
	roboplay: {
		api: process.env.ROBOPLAY_API ?? 'https://api.roboplay.dev',
		debug: process.env.ROBOPLAY_DEBUG === 'true',
		env: process.env.ROBOPLAY_ENV,
		frontend: process.env.ROBOPLAY_FRONTEND ?? 'https://roboplay.dev'
	}
}
