import type { LogDrain, LogLevel } from '../core/logger.js'
import type { ClientOptions, PermissionsString, ShardingManagerOptions } from 'discord.js'
import type { CommandContext, CommandIntegrationType, Plugin, SageOptions } from './index.js'

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
	clientOptions?: ClientOptions
	defaults?: {
		contexts?: CommandContext[]
		defaultMemberPermissions?: string | number | bigint
		dev?: boolean
		help?: boolean
		integrationTypes?: CommandIntegrationType[]
	}
	excludePaths?: string[]
	experimental?: {
		buildDirectory?: string
		disableBot?: boolean
		/**
		 * Disable granular manifest generation.
		 * When true, only the legacy manifest.json will be generated.
		 * Granular manifests are enabled by default.
		 * @default false
		 */
		disableGranularManifest?: boolean
		incrementalBuilds?: boolean
		shard?: boolean | ShardingManagerOptions
		/** @deprecated Use `integrationTypes` in command config instead */
		userInstall?: boolean
	}
	/**
	 * Controls whether commands are automatically registered during build.
	 * When set to false, commands will not be registered unless the `registerSlashCommands()` API is called explicitly.
	 * Defaults to true for backward compatibility.
	 * Can be overridden using the `--no-register` CLI flag.
	 */
	autoRegisterCommands?: boolean
	flashcore?: {
		keyv?: unknown
		/**
		 * Separator placed between namespace and key when composing Flashcore keys.
		 * Defaults to "/".
		 */
		namespaceSeparator?: string
	}
	invite?: {
		autoPermissions?: boolean
		permissions?: PermissionsString[] | number
		scopes?: Scope[]
	}
	logger?: {
		drain?: LogDrain
		enabled?: boolean
		level?: LogLevel
	}
	plugins?: Plugin[]
	portal?: {
		/** When true, disabling a module or component won't unregister commands, events, etc. */
		keepRegistered?: boolean
	}
	roboplay?: {
		node?: '18' | '20' | 'latest'
	}
	sage?: false | SageOptions
	/** Configure seed helpers that generate starter files and environment values. */
	seed?: SeedHookConfig
	timeouts?: {
		autocomplete?: number
		commandDeferral?: number
		commandRegistration?: number
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
	}
}

export type Scope =
	| 'identify'
	| 'email'
	| 'connections'
	| 'guilds'
	| 'guilds.join'
	| 'guilds.members.read'
	| 'gdm.join'
	| 'rpc'
	| 'rpc.notifications.read'
	| 'rpc.voice.read'
	| 'rpc.voice.write'
	| 'rpc.activities.write'
	| 'bot'
	| 'webhook.incoming'
	| 'messages.read'
	| 'applications.builds.upload'
	| 'applications.builds.read'
	| 'applications.commands'
	| 'applications.store.update'
	| 'applications.entitlements'
	| 'activities.read'
	| 'activities.write'
	| 'relationships.read'
	| 'voice'
	| 'dm_channels.read'
	| 'role_connections.write'
	| 'applications.commands.permissions.update'

export default {}
