import { logger } from 'robo.js'

export default () => {
	const now = new Date()
	logger.info(`${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}.${now.getMilliseconds()}`)
	return 'Hello World!'
}
