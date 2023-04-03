export * from './commands.js'
export * from './config.js'
export * from './events.js'
export * from './manifest.js'

export interface Handler {
	handler: unknown
	plugin?: {
		name: string
		path: string
	}
}

export interface RoboMessage {
	type: 'restart'
}

export type SageOptions = {
	defer?: boolean
	ephemeral?: boolean
	reply?: boolean
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
