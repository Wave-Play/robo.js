import type { PermissionsString } from 'discord.js'
import type { CommandEntry } from './commands.js'
import type { Config, Scope } from './config.js'
import type { EventConfig } from './events.js'
import type { ApiEntry, ContextEntry, MiddlewareEntry } from './index.js'

export interface Manifest {
	__README: string
	__robo: {
		config: Config | null
		language: 'javascript' | 'typescript'
		mode: string
		seed?: {
			description?: string
		}
		type: 'plugin' | 'robo'
		updatedAt?: string
		version?: string
	}
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
