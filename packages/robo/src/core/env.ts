// import { loadEnv } from './dotenv.js'

const Keys = {
	discord: {
		clientId: 'DISCORD_CLIENT_ID',
		debugChannelId: 'DISCORD_DEBUG_CHANNEL_ID',
		guildId: 'DISCORD_GUILD_ID',
		token: 'DISCORD_TOKEN'
	},
	nodeEnv: 'NODE_ENV',
	roboplay: {
		api: {
			key: 'ROBOPLAY_API',
			default: 'https://api.roboplay.dev'
		},
		debug: 'ROBOPLAY_DEBUG',
		env: 'ROBOPLAY_ENV',
		frontend: {
			key: 'ROBOPLAY_FRONTEND',
			default: 'https://roboplay.dev'
		}
	}
}

export const env = (key: string): string => {
	//loadEnv({ sync: true })
	const keyParts = key.split('.')
	
	return keyParts.reduce((acc, k) => {
		// @ts-expect-error - ...
		const value = acc[k]

		if (typeof value === 'object' && value.key) {
			return process.env[value.key] || value.default
		} else if (typeof value === 'object') {
			return value
		} else if (typeof value === 'string') {
			return process.env[value]
		}
	}, Keys) as unknown as string
}
