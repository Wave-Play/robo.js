/**
 * Logger for @robojs/discordjs
 *
 * Per AGENTS.md, each plugin uses exactly ONE forked logger.
 */
import { logger } from 'robo.js'

/**
 * Plugin-wide logger instance.
 * All files in this plugin should import and use this logger.
 */
export const discordLogger = logger.fork('discord')
