import type { CommandConfig } from './commands.js'
import type { Config } from './config.js'
import type { EventConfig } from './events.js'

export interface Manifest {
	__README: string
	__robo: {
		config: Config | null
		updatedAt?: string
		version?: string
	}
	commands: Record<string, CommandConfig>
	events: Record<string, EventConfig[]>
}
