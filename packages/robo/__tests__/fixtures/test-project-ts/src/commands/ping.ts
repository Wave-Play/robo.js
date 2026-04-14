import { logger } from 'robo.js'

/*
 * Customize your command details and options here.
 *
 * For more information, see the documentation:
 * https://robojs.dev/discord-bots/commands#command-options
 */
export const config = {
	description: 'Replies with Pong!'
} as const

/**
 * This is your command handler that will be called when the command is used.
 *
 * For more information, see the documentation:
 * https://robojs.dev/discord-bots/commands
 */
export default () => {
	logger.info('Ping command used')
	return 'Pong!'
}
