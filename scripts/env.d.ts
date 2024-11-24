export {}
declare global {
	namespace NodeJS {
		interface ProcessEnv {
			B2_ACCOUNT_ID: string
			B2_APPLICATION_KEY: string
			B2_BUCKET: string
			GH_TOKEN: string
			GITHUB_PUSH_OBJECT: string
			REPO_DATA: string
		}
	}
}
