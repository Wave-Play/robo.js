import type { Config } from 'robo.js'

export default <Config>{
	experimental: {
		disableBot: true
	},
	plugins: [],
	type: 'robo',
	watcher: {
		ignore: ['app']
	}
}
