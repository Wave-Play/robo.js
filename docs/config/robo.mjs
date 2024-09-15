// @ts-check

/**
 * @type {import('robo.js').Config}
 **/
export default {
	clientOptions: {
		intents: ['Guilds', 'GuildMessages']
	},
	experimental: {
		disableBot: true,
	},
	plugins: [],
	type: 'robo',
	watcher: {
		ignore: ['src/components', 'src/css', 'src/hooks', 'src/pages']
	}
}