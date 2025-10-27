import type { Config } from 'robo.js'

export default <Config>{
	clientOptions: {
		// Intents required for XP awarding: Guilds for guild structure, GuildMessages for message events
		intents: ['Guilds', 'GuildMessages']
	},
	plugins: [],
	type: 'plugin'
}
