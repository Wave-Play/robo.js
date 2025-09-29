import { logger } from 'robo.js/logger.js'

/**
 * Namespaced logger for all `@robojs/auth` runtime output.
 *
 * @example
 * ```ts
 * authLogger.info('auth plugin initialized')
 * ```
 */
export const authLogger = logger.fork('auth')
