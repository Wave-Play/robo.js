import type { RoboKit } from '~/index.js'

export function getKitName(kit: RoboKit, template?: string) {
	if (kit) {
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

	// Guess the kit based on the template path
	const prefix = template?.split('/')?.[0]
	switch (prefix) {
		case 'discord-activities':
			return 'Discord Activity'
		case 'discord-bots':
			return 'Discord Bot'
		case 'plugins':
			return 'Robo Plugin'
		case 'web-apps':
			return 'Web App'
		default:
			return 'Unknown'
	}
}
