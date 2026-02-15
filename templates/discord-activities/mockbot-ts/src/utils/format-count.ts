import { formatMessage } from './deeper.js'

export function formatCount(count: number): string {
	return formatMessage(`Request #${count}`)
}
