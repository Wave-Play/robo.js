import type { Config } from 'robo.js'

export default <Config>{
	experimental: {
		disableBot: true
	},
	type: 'robo',
	watcher: {
		ignore: ['src/app']
	}
}
