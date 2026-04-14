import { Robo } from 'robo.js'

export default () => {
	const statuses: Record<string, string> = {}
	const all = Robo.status.getAll()
	for (const [key, entry] of all) {
		statuses[key] = entry.value
	}

	return {
		ok: true,
		statuses
	}
}
