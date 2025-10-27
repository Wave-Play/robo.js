import { logger } from 'robo.js/logger.js'

/**
 * Plugin-wide logger instance for @robojs/roadmap.
 *
 * This is the single shared logger used by all files in the roadmap plugin.
 * All modules should import and use this logger instead of creating their own forks.
 * This ensures consistent log namespacing and easier filtering.
 *
 * The logger is forked with the plugin name 'roadmap' for easy identification in logs.
 *
 * @example
 * ```typescript
 * import { roadmapLogger } from './logger.js';
 * roadmapLogger.info('Starting sync operation');
 * roadmapLogger.error('Failed to fetch cards:', error);
 * ```
 */
export const roadmapLogger = logger.fork('roadmap')
