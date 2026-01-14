import type { Config } from 'robo.js'

export default <Config>{
	type: 'plugin',
	plugins: [
		[
			'@robojs/server',
			{
				cors: true,
				prefix: 'mock'
			}
		]
	],
	watcher: {
		ignore: ['src/app', 'src/components', 'src/hooks']
	}
}
