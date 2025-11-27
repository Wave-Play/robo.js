import type { Config } from 'robo.js'

export default <Config>{
	clientOptions: {
		intents: ['Guilds']
	},
	plugins: [],
	seed: {
		description: 'Adds roadmap configuration with Jira provider defaults.'
	},
	type: 'plugin'
}
