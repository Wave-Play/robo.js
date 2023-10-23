// imports
import type { CommandConfig } from '@roboplay/robo.js'
import { CommandInteraction } from 'discord.js'

/**
 * @name /daily
 * @description Claim your daily credits.
 */
export const config: CommandConfig = {
	description: 'Claim your daily credits.'
}

export default (interaction: CommandInteraction) => {
	return `## 🏓 Latency is ${Date.now() - interaction.createdTimestamp}ms!`
}
