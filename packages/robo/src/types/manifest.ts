import type { PermissionsString } from 'discord.js'
import type { CommandConfig } from './commands.js'
import type { Config, Scope } from './config.js'
import type { EventConfig } from './events.js'

export interface Manifest {
	__README: string
	__robo: {
		config: Config | null
		type: 'plugin' | 'robo'
		updatedAt?: string
		version?: string
	}
	commands: Record<string, CommandConfig>
	events: Record<string, EventConfig[]>
	permissions?: PermissionsString[] | number
	scopes?: Scope[]
}
