/** Namespaced logger instance for the AI plugin. */
import { logger as defaultLogger } from 'robo.js'

/**
 * Forked logger that prefixes log entries with the AI namespace for easier filtering.
 */
export const logger = defaultLogger.fork('ai')
