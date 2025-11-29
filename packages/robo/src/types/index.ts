export default {}
export type * from './api.js'
export type * from './commands.js'
export type * from './common.js'
export type * from './config.js'
export type * from './events.js'
export type * from './lifecycle.js'
export type * from './manifest.js'

import type { CommandEntry } from './commands.js'
import type { ContextEntry } from './common.js'

export interface RegisterSlashCommandsEntries {
	commands?: Record<string, CommandEntry>
	messageContext?: Record<string, ContextEntry>
	userContext?: Record<string, ContextEntry>
}

export interface RegisterSlashCommandsOptions {
	guildIds?: string[]
	force?: boolean
	clientId?: string
	token?: string
}

export interface RegisterCommandsError {
	command: string
	error: string
	type: 'validation' | 'api' | 'timeout'
}

export interface RegisterCommandsRetry {
	scope: string
	attempt: number
	reason: string
	delay: number
}

export interface RegisterCommandsResult {
	success: boolean
	registered: number
	errors: RegisterCommandsError[]
	retries?: RegisterCommandsRetry[]
}
