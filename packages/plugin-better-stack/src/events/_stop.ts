import { heartbeatIntervalId } from './_start.js'

export default () => {
	if (heartbeatIntervalId) {
		clearInterval(heartbeatIntervalId)
	}
}
