import { logger } from 'robo.js'
import type { Message } from 'discord.js'

/**
 * This `messageCreate` event handler will be called whenever a message is created in a channel or DM.
 * If `message.content` is empty, you may need to enable "Message Content Intent" in the Discord Developer Portal.
 *
 * Learn more about Discord events:
 * https://robojs.dev/discord-bots/events
 */
export default (message: Message) => {
	logger.info(`${message.author} sent message: ${message.content}`)
}