import type { LogDrain, LogLevel } from '../core/logger.js'
import type { ClientOptions, PermissionsString, ShardingManagerOptions } from 'discord.js'
import type { CommandContext, CommandIntegrationType, Plugin, SageOptions } from './index.js'

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
		incrementalBuilds?: boolean
		shard?: boolean | ShardingManagerOptions
		/** @deprecated Use `integrationTypes` in command config instead */
		userInstall?: boolean
	}
	flashcore?: {
		keyv?: unknown
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
	seed?: {
		description?: string
	}
	timeouts?: {
		autocomplete?: number
		commandDeferral?: number
		commandRegistration?: number
		lifecycle?: number
	}
	type?: 'plugin' | 'robo'

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
