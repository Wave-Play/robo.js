export {}
declare global {
	namespace NodeJS {
		interface ProcessEnv {
			DISCORD_CLIENT_ID: string
			DISCORD_TOKEN: string
			POSTGRES_HOST: string
			POSTGRES_PORT: number
			POSTGRES_DATABASE: string
			POSTGRES_USERNAME: string
			POSTGRES_PASSWORD: string
		}
	}
}
