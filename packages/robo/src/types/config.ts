import type { LogDrain, LogLevel } from '../core/logger.js'
import type { Plugin } from './index.js'
import type { BuildDirectoryOption } from '../core/paths.js'

/**
 * Timestamp format for log entries.
 * - 'iso': ISO 8601 format (2025-01-15T10:30:00.123Z)
 * - 'unix': Unix timestamp in milliseconds (1736937000123)
 * - 'short': Time only (10:30:00.123)
 * - 'long': Date and time with space (2025-01-15 10:30:00.123)
 * - false: No timestamp
 */
export type TimestampFormat = 'iso' | 'unix' | 'short' | 'long' | false

/**
 * Configuration for a file-based log output.
 */
export interface FileOutputConfig {
	/** File path for log output. Relative paths resolved from project root. */
	path: string
	/** Minimum log level to write to this file. Inherits from logger.level if not set. */
	level?: LogLevel
	/** Timestamp format for this file. Overrides global logger.timestamp if set. */
	timestamp?: TimestampFormat
	/** Maximum file size in bytes before rotation. Default: 10MB (10485760) */
	maxSize?: number
	/** Maximum number of rotated files to keep. Default: 5 */
	maxFiles?: number
	/** Output format: 'text' for human-readable, 'json' for structured. Default: 'text' */
	format?: 'text' | 'json'
	/**
	 * Generate a companion .colormap file that records ANSI escape code positions.
	 * This allows colors to be reconstructed from stripped log files.
	 * Default: false
	 */
	colorMap?: boolean
	/**
	 * Enable session-based log rotation. When true, the previous session's log
	 * is archived on startup and a new file is started. Default: true
	 */
	sessionRotation?: boolean
	/** Maximum number of archived session files to keep. Default: 10 */
	maxSessionFiles?: number
}

/**
 * Options for creating a file drain imperatively.
 */
export interface FileDrainOptions {
	/** Absolute or relative file path for log output. */
	path: string
	/** Minimum log level to write. */
	level?: LogLevel
	/** Timestamp format to prepend to log entries. Default: false (no timestamp) */
	timestamp?: TimestampFormat
	/** If true, awaits each write before returning (sync-like). Default: false */
	blocking?: boolean
	/** Output format. Default: 'text' */
	format?: 'text' | 'json'
	/** Strip ANSI color codes from output. Default: true */
	stripAnsi?: boolean
	/** Maximum file size in bytes before rotation. Default: 10MB */
	maxSize?: number
	/** Maximum number of rotated files to keep. Default: 5 */
	maxFiles?: number
	/**
	 * Generate a companion .colormap file that records ANSI escape code positions.
	 * This allows colors to be reconstructed later. Only used when stripAnsi is true.
	 * Default: false
	 */
	colorMap?: boolean
	/**
	 * Enable session-based log rotation. When true, the previous session's log
	 * is archived on startup and a new file is started. Default: true
	 */
	sessionRotation?: boolean
	/** Maximum number of archived session files to keep. Default: 10 */
	maxSessionFiles?: number
}

/**
 * Handle returned when adding a drain to the logger.
 * Provides methods to remove the drain and flush pending writes.
 */
export interface DrainHandle {
	/** Unique identifier for this drain. */
	id: string
	/** Remove this drain from the logger. */
	remove: () => boolean
	/** Flush pending writes for this drain. */
	flush: () => Promise<void>
}

export interface SeedHookGenerators {
	randomBase64: (bytes?: number) => string
	randomHex: (bytes?: number) => string
	randomUUID: () => string
}

export interface SeedHookHelpers {
	generators: SeedHookGenerators
	log: (...args: unknown[]) => void
}

export type SeedHookHandler = (helpers: SeedHookHelpers) => unknown | Promise<unknown>

export interface SeedEnvVariableConfig {
	/** Explanation shown to users when prompting for this variable. */
	description?: string
	/** Allow overwriting pre-existing keys when seeding. */
	overwrite?: boolean
	/** Default value assigned when writing to env files. */
	value?: string
}

export interface SeedEnvConfig {
	/** Summary displayed before prompting for environment values. */
	description?: string
	/** Map of variables to seed into detected env files. */
	variables?: Record<string, SeedEnvVariableConfig | string>
}

export interface SeedHookConfig {
	/** Short description of what seeding provides. */
	description?: string
	/** Environment variable seeding options for this plugin/project. */
	env?: SeedEnvConfig
	/** Custom seeding logic executed prior to file generation. */
	hook?: SeedHookHandler
}

export interface Config {
	excludePaths?: string[]
	experimental?: {
		/**
		 * Custom build output directory.
		 *
		 * Can be a static string (bypasses mode logic) or a function that
		 * receives context with the current mode for dynamic resolution.
		 *
		 * @example
		 * // Static string
		 * buildDirectory: 'dist'
		 *
		 * @example
		 * // Dynamic function
		 * buildDirectory: (ctx) => `dist/${ctx.mode}`
		 */
		buildDirectory?: BuildDirectoryOption
		incrementalBuilds?: boolean
	}
	flashcore?: {
		keyv?: unknown
		/**
		 * Separator placed between namespace and key when composing Flashcore keys.
		 * Defaults to "/".
		 */
		namespaceSeparator?: string
	}
	logger?: {
		drain?: LogDrain
		enabled?: boolean
		level?: LogLevel
		/** Global timestamp format for all log outputs. Default: false (no timestamps) */
		timestamp?: TimestampFormat
		/**
		 * Generate companion .colormap files for file-based log outputs.
		 * These files record ANSI escape code positions, allowing colors to be reconstructed.
		 * Individual file configs can override this setting. Default: false
		 */
		colorMap?: boolean
		/** File-based log outputs. In development mode, defaults to logs/dev.log if undefined. */
		files?: FileOutputConfig[]
	}
	plugins?: Plugin[]
	portal?: {
		/** When true, disabling a module or component won't unregister commands, events, etc. */
		keepRegistered?: boolean
		/**
		 * Handler loading strategy.
		 * - 'eager': Import all handlers at startup (faster runtime, slower startup)
		 * - 'lazy': Import handlers on first access (faster startup, slower first access)
		 *
		 * Defaults to 'eager' in production, 'lazy' in development.
		 */
		loading?: 'eager' | 'lazy'
	}
	roboplay?: {
		node?: '18' | '20' | 'latest'
	}
	/** Configure seed helpers that generate starter files and environment values. */
	seed?: SeedHookConfig
	timeouts?: {
		lifecycle?: number
	}
	type?: 'plugin' | 'robo'

	/**
	 * Portal namespace for plugin routes.
	 * If omitted, inferred from package name:
	 * - @robojs/discord → 'discord'
	 * - @robojs/server → 'server'
	 * - robo-plugin-analytics → 'analytics'
	 */
	namespace?: string

	/** How often to check for updates to Robo.js in seconds. Default: 1 hour */
	updateCheckInterval?: number

	watcher?: {
		ignore?: string[]
		/**
		 * Shell commands to spawn as companion processes during --watch mode.
		 * Each command runs once when the watcher starts and is killed on exit.
		 */
		commands?: string[]
	}
}

export default {}
