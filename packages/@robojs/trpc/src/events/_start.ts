import path from 'path'
import { getPluginOptions } from 'robo.js'

export let serverPrefix = '/api'

export default () => {
	let packageName = `@robojs${path.sep}server`
	const { prefix } = getPluginOptions(packageName) as { prefix?: string }
	serverPrefix = (prefix === undefined ? '/api' : prefix || '/')
}
