import { color, logger as defaultLogger } from '@roboplay/robo.js'

export const logger = defaultLogger.fork(color.magenta('ai') + ' -')
