import { getPluginOptions } from 'robo.js'

export let serverPrefix = '/api'

export default () => {
	const serverOptions = getPluginOptions('@robojs/server') as { prefix?: string }
	serverPrefix = '/' + (serverOptions.prefix || 'api')
}
