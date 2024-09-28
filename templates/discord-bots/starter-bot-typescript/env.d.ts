export {}
declare global {
	namespace NodeJS {
		interface ProcessEnv {
			DISCORD_CLIENT_ID: string
			DISCORD_TOKEN: string
		}
	}
}
