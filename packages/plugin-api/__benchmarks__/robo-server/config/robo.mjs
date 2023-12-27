// @ts-check

/**
 * @type {import('@roboplay/robo.js').Config}
 **/
export default {
	clientOptions: {
		intents: [
			'Guilds',
			'GuildMessages',
			'MessageContent'
		]
	},
	logger: {
		level: 'debug'
	},
	plugins: [],
	type: 'robo'
}
