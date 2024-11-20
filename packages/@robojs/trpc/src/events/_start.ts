import { getPluginOptions } from 'robo.js'

export let serverPrefix = '/api'

export default () => {
	const { prefix } = getPluginOptions('@robojs/server') as { prefix?: string }
	serverPrefix = (prefix === undefined ? '/api' : prefix || '/')
}
