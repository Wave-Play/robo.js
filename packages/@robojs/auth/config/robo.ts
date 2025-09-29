import type { Config } from 'robo.js'

export default <Config>{
	seed: {
		description: 'Adds secure defaults for authentication flows.',
		hook: async ({ generators }) => {
			const secret = generators.randomHex(32)

			return {
				env: {
					description: 'Generates a unique AUTH_SECRET to secure Robo Auth sessions.',
					variables: {
						AUTH_SECRET: {
							description: 'Secret used to sign and verify authentication payloads.',
							overwrite: false,
							value: secret
						}
					}
				}
			}
		}
	},
	type: 'plugin'
}
