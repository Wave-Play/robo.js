import type { LogLevel } from '../core/logger.js'

/**
 * Handler object returned after lazy import.
 * Contains the default export, config, and any named exports.
 */
export interface HandlerModule<THandler = unknown, _TNamedExports = Record<string, unknown>> {
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

export interface FlashcoreAdapter<K = string, V = unknown> {
	clear(): Promise<boolean> | Promise<void> | boolean | void
	delete(key: K): Promise<boolean> | boolean
	get(key: K): Promise<V | undefined> | V | undefined
	init(): Promise<void> | void
	set(key: K, value: V): Promise<boolean> | boolean
	has(key: K): Promise<boolean> | boolean
}

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
		| 'hmr-compile' | 'hmr-reload-handler' | 'hmr-reload-route' | 'hmr-status' | 'hmr-notify'
		| 'cli-state-set' | 'cli-state-delete' | 'cli-state-forks'
		| 'status-set' | 'status-remove' | 'status-flash' | 'status-progress'
		| 'terminal-exec' | 'terminal-write' | 'terminal-drawer'
	logLevel?: LogLevel
	payload?: unknown
	state?: Record<string, unknown>
	verbose?: boolean
}

/**
 * Payload for HMR handler reload events.
 */
export interface HmrReloadHandlerPayload {
	namespace: string
	route: string
	key: string
	/** Handler path relative to build dir (e.g., "events/messageCreate/example.js") */
	handlerPath: string
}

/**
 * Payload for HMR route reload events.
 */
export interface HmrReloadRoutePayload {
	namespace: string
	route: string
}

/**
 * Payload sent from CLI to spirit for terminal command execution.
 */
export interface TerminalExecPayload {
	handlerPath: string
	args: string[]
	options: Record<string, unknown>
	drawerAvailable: boolean
}

/**
 * Result returned from spirit after terminal command execution.
 */
export interface TerminalExecResult {
	success: boolean
	returnValue?: string
	error?: string
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
	/** Seed configuration from the plugin's manifest */
	seed?: {
		description?: string
		env?: {
			description?: string
			variables?: Record<string, { description?: string; overwrite?: boolean; value?: string } | string>
		}
		hook?: string
	}
}

/**
 * Lifecycle hook types that support priority-based execution.
 */
export type LifecycleHookType = 'init' | 'prepare' | 'start' | 'stop' | 'setup' | 'hmr'

export interface PluginMetaOptions {
	failSafe?: boolean
	/**
	 * Override hook execution priorities for this plugin.
	 * Lower numbers run first. Default priority is 100.
	 * Hooks with the same priority run in parallel.
	 *
	 * @example
	 * ```typescript
	 * // In robo.config.ts
	 * plugins: [
	 *   ['@robojs/server', { port: 3000 }, { hookPriority: { start: 50 } }]
	 * ]
	 * ```
	 */
	hookPriority?: Partial<Record<LifecycleHookType, number>>
}

export interface BaseConfig {
	/** Plugin that provides this handler (set during plugin manifest merge) */
	__plugin?: {
		name: string
		path: string
	}
	description?: string
	disabled?: boolean
	timeout?: number
}
