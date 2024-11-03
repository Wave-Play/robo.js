// @ts-check

/**
 * @type {import('robo.js').Config}
 **/
export default {
	experimental: {
		disableBot: true
	},
	plugins: [],
	type: 'robo',
	watcher: {
		ignore: ['src/lib', 'src/routes', 'src/hooks']
	}
};
