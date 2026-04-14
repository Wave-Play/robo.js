// Node.js-specific drain utilities
// Import from 'robo.js/logger/drains'

export { createFileDrain, formatTimestamp, setFileDrainSessionId } from './file-drain.js'
export { createMultiDrain, createLevelFilteredDrain } from './logger.js'
export type { FileDrainOptions, TimestampFormat, FileOutputConfig, DrainHandle } from '../types/config.js'
export type { LogDrain, LogMetadata } from './logger.js'
