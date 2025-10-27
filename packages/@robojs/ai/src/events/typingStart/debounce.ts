/** Minimal typing event handler that logs activity for debugging purposes. */
import { logger } from '@/core/logger.js'
import { client } from 'robo.js'
import type { Typing } from 'discord.js'

/** Handles typing start events, logging them while skipping the bot's own typing events. */
export default (event: Typing) => {
	const { user } = event

	if (user.id === client.user?.id) {
		// Ignore typing events from the bot itself

		return
	}

	logger.debug(`Ignoring typing event from @${user.username}`)
}
