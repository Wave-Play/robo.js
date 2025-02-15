import type { LogLevel } from '../core/logger.js'
import type { CommandContext, CommandIntegrationType } from './commands.js'

export * from './api.js'
export * from './commands.js'
export * from './config.js'
export * from './events.js'
export * from './manifest.js'

export interface ContextConfig extends BaseConfig {
	contexts?: CommandContext[]
	defaultMemberPermissions?: string | number | bigint
	/** @deprecated Use `contexts` instead */
	dmPermission?: boolean
	integrationTypes?: CommandIntegrationType[]
	nameLocalizations?: Record<string, string>
	sage?: false | SageOptions
	timeout?: number
}

export type ContextEntry = ContextConfig

export interface Context {
	config?: ContextConfig
	default: (...data: unknown[]) => unknown | Promise<unknown>
}

export interface FlashcoreAdapter<K = string, V = unknown> {
	clear(): Promise<boolean> | Promise<void> | boolean | void
	delete(key: K): Promise<boolean> | boolean
	get(key: K): Promise<V | undefined> | V | undefined
	init(): Promise<void> | void
	set(key: K, value: V): Promise<boolean> | boolean
	has(key: K): Promise<boolean> | boolean
}

export interface HandlerRecord<T = unknown> {
	auto?: boolean
	description?: string
	handler: T
	key: string
	module?: string
	path: string
	plugin?: {
		name: string
		path: string
	}
	type: 'api' | 'command' | 'context' | 'event' | 'middleware'
}

export interface MiddlewareData {
	payload: unknown[]
	record: HandlerRecord
}

export interface MiddlewareResult {
	abort?: boolean
}

export interface Middleware {
	default: (data: MiddlewareData) => void | MiddlewareResult | Promise<MiddlewareResult>
}

export type MiddlewareEntry = BaseConfig

export interface PackageJson {
	name: string
	version: string
	description?: string
	scripts?: Record<string, string>
	dependencies?: Record<string, string>
	devDependencies?: Record<string, string>
	main?: string
	types?: string
	engines?: {
		node?: string
		npm?: string
	}
	repository?: {
		type: string
		url: string
	}
}

export interface RoboMessage {
	type: 'ready' | 'restart' | 'state-load' | 'state-save'
}

export interface RoboStateMessage extends RoboMessage {
	state: Record<string, unknown>
}

export interface SpiritMessage {
	error?: unknown
	event?: 'build' | 'get-state' | 'command' | 'ready' | 'restart' | 'set-state' | 'start' | 'stop'
	logLevel?: LogLevel
	payload?: unknown
	state?: Record<string, unknown>
	verbose?: boolean
}

export type SageOptions = {
	defer?: boolean
	deferBuffer?: number
	ephemeral?: boolean
	errorChannelId?: string
	errorMessage?: string
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
	description?: string
	timeout?: number
}

export default {}
