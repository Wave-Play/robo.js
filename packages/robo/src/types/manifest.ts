import type { PermissionsString } from 'discord.js'
import type { CommandEntry } from './commands.js'
import type { Config, Scope, SeedEnvVariableConfig } from './config.js'
import type { EventConfig } from './events.js'
import type { ApiEntry, ContextEntry, MiddlewareEntry } from './index.js'
import type { ProcessedEntry } from './routes.js'

export type ManifestSeedEnvVariables = Record<string, SeedEnvVariableConfig | string>

export interface ManifestSeedEnv {
	description?: string
	variables?: ManifestSeedEnvVariables
	hook?: string
}

export interface ManifestSeed {
	description?: string
	env?: ManifestSeedEnv
	hook?: string
}

/**
 * Route entries organized by namespace and route name.
 * This is the new plugin-based route system format.
 */
export type ManifestRoutes = {
	[namespace: string]: {
		[routeName: string]: ProcessedEntry[]
	}
}

export interface Manifest {
	__README: string
	__robo: {
		config: Config | null
		language: 'javascript' | 'typescript'
		mode: string
		seed?: ManifestSeed
		type: 'plugin' | 'robo'
		updatedAt?: string
		version?: string
	}
	/**
	 * Route entries from the new plugin-based route system.
	 * Organized by namespace (plugin) and route name.
	 */
	__routes?: ManifestRoutes
	api: Record<string, ApiEntry>
	commands: Record<string, CommandEntry>
	context: {
		message: Record<string, ContextEntry>
		user: Record<string, ContextEntry>
	}
	events: Record<string, EventConfig[]>
	permissions?: PermissionsString[] | number
	middleware?: MiddlewareEntry[]
	scopes?: Scope[]
}

export default {}
