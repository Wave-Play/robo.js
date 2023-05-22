import type { PermissionsString } from 'discord.js'
import type { CommandEntry } from './commands.js'
import type { Config, Scope } from './config.js'
import type { EventConfig } from './events.js'
import type { ContextEntry } from './index.js'

export interface Manifest {
	__README: string
	__robo: {
		config: Config | null
		type: 'plugin' | 'robo'
		updatedAt?: string
		version?: string
	}
	commands: Record<string, CommandEntry>
	context: {
		message: Record<string, ContextEntry>
		user: Record<string, ContextEntry>
	}
	events: Record<string, EventConfig[]>
	permissions?: PermissionsString[] | number
	scopes?: Scope[]
}
