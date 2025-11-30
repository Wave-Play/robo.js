import type { LogLevel } from '../core/logger.js'
import type { CommandContext, CommandIntegrationType } from './commands.js'

/**
 * Handler object returned after lazy import.
 * Contains the default export, config, and any named exports.
 */
export interface HandlerModule<THandler = unknown, TNamedExports = Record<string, unknown>> {
	default?: THandler
	config?: unknown
	module?: string
	[key: string]: unknown
}

/**
 * Handler record representing a registered handler in the portal.
 * The handler field is null until lazy-loaded.
 */
export interface HandlerRecord<THandler = unknown, TNamedExports = Record<string, unknown>> {
	/**
	 * Handler module. NULL until imported (lazy loading).
	 * After import, contains default, config, and named exports.
	 */
	handler: (HandlerModule<THandler> & TNamedExports) | null

	/**
	 * Which exports this handler has (from manifest).
	 * Available BEFORE handler is imported.
	 */
	exports: {
		default: boolean
		config: boolean
		named: string[]
	}

	/** Handler key (e.g., 'ping', 'admin ban') */
	key: string

	/** Route type in namespace:route format (e.g., 'discord:commands') */
	type: string

	/** Path to the compiled handler file */
	path: string

	/** Metadata extracted from config export */
	metadata: Record<string, unknown>

	/** Plugin that provides this handler */
	plugin?: {
		name: string
		version: string
	}

	/** Module this handler belongs to (for cross-cutting enable/disable) */
	module?: string

	/** Whether this handler was auto-generated */
	auto?: boolean

	/** Runtime enable/disable state */
	enabled: boolean
}

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
	/** Plugin version (from package.json) */
	version?: string
	/** Path to the plugin package */
	path?: string
	/** Portal namespace for this plugin's routes */
	namespace?: string
	/** Hook definitions from the plugin */
	hooks?: Array<{
		type: string
		path: string
		priority?: number
		phase?: 'start' | 'transform' | 'complete'
	}>
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
	disabled?: boolean
	serverOnly?: string[] | string
	timeout?: number
}
