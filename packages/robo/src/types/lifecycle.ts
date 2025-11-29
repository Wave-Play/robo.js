import type { Logger } from '../core/logger.js'
import type { Env } from '../core/env.js'
import type { Config } from './config.js'

/**
 * Context provided to init hooks.
 * Runs BEFORE manifest loading and portal population.
 * Use for early setup like log drains, monkey-patching internals.
 */
export interface InitContext {
	config: Config
	logger: Logger
	env: typeof Env
	mode: 'development' | 'production'
}

/**
 * Context provided to setup hooks.
 * Runs during CLI operations: create-robo or robo add.
 */
export interface SetupContext {
	trigger: 'create' | 'add'
	logger: Logger
	env: typeof Env
	paths: {
		root: string
		src: string
		config: string
	}
	exec: (command: string) => Promise<{ stdout: string; stderr: string }>
	prompt: <T>(questions: PromptQuestion[]) => Promise<T>
	package: {
		name: string
		version: string
		type: 'template' | 'plugin'
	}
}

export interface PromptQuestion {
	type: 'input' | 'password' | 'confirm' | 'list' | 'checkbox'
	name: string
	message: string
	default?: unknown
	choices?: Array<string | { name: string; value: unknown }>
	when?: boolean
}

/**
 * Plugin-scoped state storage.
 * Isolated from other plugins using namespaced keys.
 */
export interface PluginState {
	/**
	 * Get a value from plugin state.
	 */
	get<T>(key: string): T | undefined

	/**
	 * Set a value in plugin state.
	 */
	set<T>(key: string, value: T): void

	/**
	 * Check if a key exists in plugin state.
	 */
	has(key: string): boolean

	/**
	 * Delete a key from plugin state.
	 */
	delete(key: string): boolean

	/**
	 * Clear all plugin state.
	 */
	clear(): void
}

/**
 * Context provided to start and stop hooks.
 * Start runs SEQUENTIALLY in registration order.
 * Stop runs SEQUENTIALLY in REVERSE order.
 */
export interface PluginContext<TConfig = unknown> {
	/**
	 * Plugin's configuration from user's /config/plugins/.
	 * Typed based on plugin's config schema.
	 */
	config: TConfig

	/**
	 * Plugin-scoped state storage.
	 * Isolated from other plugins.
	 */
	state: PluginState

	/**
	 * Logger instance prefixed with plugin name.
	 */
	logger: Logger

	/**
	 * Environment variable access.
	 */
	env: typeof Env

	/**
	 * Portal access scoped to this plugin's routes.
	 * Reserved for future route system (Phase 3).
	 */
	portal?: unknown

	/**
	 * Plugin metadata.
	 */
	meta: {
		/** Package name */
		name: string
		/** Package version */
		version: string
	}
}

export default {}
