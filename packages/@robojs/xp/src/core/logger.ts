import { logger } from 'robo.js'

// Shared plugin logger for @robojs/xp
// All files in this plugin should import and use this instance
export const xpLogger = logger.fork('xp')
