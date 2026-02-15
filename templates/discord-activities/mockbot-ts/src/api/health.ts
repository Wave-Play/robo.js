import { formatCount } from '../utils/format-count.js'

let requestCount = 0

export default () => {
	requestCount++
	return { status: 'ok', message: formatCount(requestCount) }
}
