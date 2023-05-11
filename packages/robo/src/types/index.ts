export * from './commands.js'
export * from './config.js'
export * from './events.js'
export * from './manifest.js'

export interface Handler {
	auto?: boolean
	handler: unknown
	path: string
	plugin?: {
		name: string
		path: string
	}
}

export interface RoboMessage {
	type: 'ready' | 'restart' | 'state-load' | 'state-save'
}

export interface RoboStateMessage extends RoboMessage {
	state: State
}

export type State = Record<string, unknown>

export type SageOptions = {
	defer?: boolean
	deferBuffer?: number
	ephemeral?: boolean
	errorReplies?: boolean
}

export type Plugin = string | [string, unknown, PluginMetaOptions?]

export interface PluginData {
	name: string
	options?: unknown
	metaOptions?: PluginMetaOptions
}

export interface PluginMetaOptions {
	failSafe?: boolean
}

export interface BaseConfig {
	__auto?: true
	__path?: string
	__plugin?: {
		name: string
		path: string
	}
	timeout?: number
}
