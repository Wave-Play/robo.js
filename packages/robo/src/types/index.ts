export * from './commands.js'
export * from './config.js'
export * from './events.js'
export * from './manifest.js'

export interface ContextConfig extends BaseConfig {
	nameLocalizations?: Record<string, string>
	sage?: false | SageOptions
	timeout?: number
}

export type ContextEntry = ContextConfig

export interface Context {
	config?: ContextConfig
	default: (...data: unknown[]) => unknown | Promise<unknown>
}

export interface HandlerRecord<T = unknown> {
	auto?: boolean
	handler: T
	module?: string
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
	__module?: string
	__path?: string
	__plugin?: {
		name: string
		path: string
	}
	timeout?: number
}
