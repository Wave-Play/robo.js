import { createCommandConfig, logger } from 'robo.js'

/*
 * Customize your command details and options here.
 *
 * For more information, see the documentation:
 * https://robojs.dev/discord-bots/commands#command-options
 */
export const config = createCommandConfig({
	description: 'Replies with Pong!'
})

/**
 * This is your command handler that will be called when the command is used.
 * You can either use the `interaction` Discord.js object directly, or return a string or object.
 *
 * For more information, see the documentation:
 * https://robojs.dev/discord-bots/commands
 */
export default (interaction) => {
	logger.info(`Ping command used by ${interaction.user}`)

	interaction.reply('Pong!')
}
