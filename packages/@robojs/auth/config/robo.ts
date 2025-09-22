import type { Config } from 'robo.js'

export default <Config>{
	clientOptions: {
		intents: ['Guilds', 'GuildMessages']
	},
	plugins: [
		['@robojs/server', {}],
		[
			'@robojs/auth',
			{
				basePath: '/api/auth',
				providers: []
			}
		]
	],
	type: 'plugin'
}
