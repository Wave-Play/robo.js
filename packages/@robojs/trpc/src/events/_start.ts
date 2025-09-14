import path from 'path'
import { getPluginOptions } from 'robo.js'

export let serverPrefix = '/api'

export default () => {
	const packageName = `@robojs${path.sep}server`
	const { prefix } = getPluginOptions(packageName) as { prefix?: string }
	serverPrefix = (prefix === undefined ? '/api' : prefix || '/')
}
