export {}

declare global {
	namespace NodeJS {
		interface ProcessEnv {
			NODE_OPTIONS: string
			DISCORD_CLIENT_ID: string
			DISCORD_CLIENT_SECRET: string
		}
	}
}
