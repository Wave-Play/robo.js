import dotenv from 'dotenv'
dotenv.config()

export const env = {
	discord: {
		clientId: process.env.DISCORD_CLIENT_ID,
		guildId: process.env.DISCORD_GUILD_ID,
		token: process.env.DISCORD_TOKEN
	},
	roboplay: {
		host: process.env.ROBOPLAY_HOST
	}
}
