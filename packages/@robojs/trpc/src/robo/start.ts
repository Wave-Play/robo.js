import { getPluginOptions } from 'robo.js'

export let serverPrefix = '/api'

export default () => {
	const packageName = `@robojs/server`
	const options = getPluginOptions(packageName) as { prefix?: string } | null
	const prefix = options?.prefix
	serverPrefix = prefix === undefined ? '/api' : prefix || '/'
}
