import { getHeartbeatIntervalId } from './start.js'

export default () => {
	const heartbeatIntervalId = getHeartbeatIntervalId()
	if (heartbeatIntervalId) {
		clearInterval(heartbeatIntervalId)
	}
}
