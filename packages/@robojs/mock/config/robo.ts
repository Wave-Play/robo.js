import type { Config } from 'robo.js'

export default <Config>{
	type: 'plugin',
	plugins: [
		[
			'@robojs/server',
			{
				cors: true,
				prefix: 'mock',
				viteBuild: {
					configFile: 'config/vite.stage.mjs'
				}
			}
		]
	],
	watcher: {
		ignore: ['src/app', 'src/components', 'src/hooks'],
		commands: ['vite build --config config/vite.stage.mjs --watch']
	}
}
