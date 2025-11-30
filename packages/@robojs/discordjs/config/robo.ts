import type { Config } from 'robo.js'

/**
 * Plugin configuration for @robojs/discordjs
 *
 * The namespace 'discord' is used for portal access:
 * - portal.discord.commands
 * - portal.discord.events
 * - portal.discord.context
 */
export default <Config>{
	// Portal namespace for all routes in this plugin
	namespace: 'discord',

	// Mark this as a plugin package
	type: 'plugin'
}
