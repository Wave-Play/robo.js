import type { RoboKit } from '~/index.js'

export function getKitName(kit: RoboKit) {
	switch (kit) {
		case 'activity':
			return 'Discord Activity'
		case 'app':
			return 'Discord Activity'
		case 'bot':
			return 'Discord Bot'
		case 'plugin':
			return 'Robo Plugin'
		case 'web':
			return 'Web App'
		default:
			return 'Unknown'
	}
}
