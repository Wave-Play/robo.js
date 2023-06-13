import type { Message } from 'discord.js'
import { FLASHCORE_KEY, adminIds, setMaintenanceEnabled } from '../core/config.js'
import { Flashcore } from '@roboplay/robo.js'

export default async (message: Message) => {
	// Allow admins to change maintenance mode via !maintenance command
	if (message.content.startsWith('!maintenance') && adminIds.includes(message.author.id)) {
		const [, mode] = message.content.split(' ')

		if (mode === 'on') {
			setMaintenanceEnabled(true)
			await Flashcore.set(FLASHCORE_KEY, 'true')
			message.channel.send('Maintenance mode enabled.')
		} else if (mode === 'off') {
			setMaintenanceEnabled(false)
			await Flashcore.set(FLASHCORE_KEY, 'false')
			message.channel.send('Maintenance mode disabled.')
		} else {
			message.channel.send('Invalid mode. Use `!maintenance on` or `!maintenance off`.')
		}
	}
}
