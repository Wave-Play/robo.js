import type { Logger } from '../core/logger.js'
import type { Env } from '../core/env.js'
import type { Config } from './config.js'
import type { ApiEntry, ContextEntry, MiddlewareEntry } from './index.js'
import type { CommandEntry } from './commands.js'
import type { EventConfig } from './events.js'
import type { Manifest } from './manifest.js'
import type { ProcessedEntry, RouteEntries } from './routes.js'
import type { AggregatedMetadata, HandlerEntry, MetadataAggregator } from './manifest-v1.js'

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
 * Start runs SEQUENTIALLY: plugins in registration order → project.
 * Stop runs SEQUENTIALLY: project first → plugins in REVERSE order.
 */
export interface PluginContext<TConfig = unknown> {
	/**
	 * Current runtime mode.
	 */
	mode: 'development' | 'production'

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

/**
 * Context provided to start.ts hooks.
 * Alias for PluginContext for clarity.
 */
export type StartContext<TConfig = unknown> = PluginContext<TConfig>

/**
 * Context provided to stop.ts hooks.
 * Extends PluginContext with shutdown reason.
 */
export interface StopContext<TConfig = unknown> extends PluginContext<TConfig> {
	/**
	 * Reason for shutdown.
	 * - 'signal': SIGTERM/SIGINT received
	 * - 'error': Uncaught exception
	 * - 'restart': HMR restart (though stop hooks typically don't run on restart)
	 */
	reason: 'signal' | 'error' | 'restart'
}

/**
 * Context provided to build hooks.
 * Base context shared by all build hook types.
 */
export interface BuildContext {
	/** Current build mode */
	mode: 'development' | 'production'

	/** Environment variable access */
	env: typeof Env

	/** Logger instance (forked for plugins) */
	logger: Logger

	/** Project paths */
	paths: {
		root: string
		src: string
		output: string
	}

	/** Loaded configuration */
	config: Config
}

/**
 * Context provided to build/transform.ts hooks.
 * Extends BuildContext with collected handler entries.
 * Runs AFTER entries are scanned, BEFORE manifest is written.
 */
export interface BuildTransformContext extends BuildContext {
	/**
	 * Collected handler entries by type.
	 * Can be filtered/modified by plugins.
	 */
	entries: {
		api: Record<string, ApiEntry>
		commands: Record<string, CommandEntry>
		context: {
			message: Record<string, ContextEntry>
			user: Record<string, ContextEntry>
		}
		events: Record<string, EventConfig[]>
		middleware: MiddlewareEntry[]
	}
}

/**
 * Context provided to build/complete.ts hooks.
 * Extends BuildContext with the generated manifest.
 * Runs AFTER manifest is written.
 */
export interface BuildCompleteContext extends BuildContext {
	/** The generated manifest */
	manifest: Manifest

	/**
	 * Access to processed route entries.
	 * Enables plugins to inspect all handlers during build.
	 */
	entries: {
		/**
		 * Get entries for a specific route.
		 * @param namespace - Plugin namespace (e.g., 'discord', 'server')
		 * @param route - Route name (e.g., 'commands', 'api')
		 */
		get(namespace: string, route: string): ProcessedEntry[]

		/**
		 * Get all entries organized by namespace and route.
		 */
		all(): RouteEntries

		/**
		 * Get handler entries (with source tracking) for a route.
		 * @param namespace - Plugin namespace
		 * @param route - Route name
		 */
		handlers(namespace: string, route: string): HandlerEntry[]
	}

	/**
	 * Register a metadata aggregator for a namespace.
	 * Aggregators combine metadata from all handlers into a summary.
	 * @param namespace - Plugin namespace to aggregate (e.g., 'discord')
	 * @param aggregator - Function that processes entries into aggregated metadata
	 */
	registerMetadataAggregator<T extends AggregatedMetadata>(
		namespace: string,
		aggregator: MetadataAggregator<T>
	): void

	/**
	 * Update aggregated metadata for a namespace.
	 * Can be called multiple times; updates are merged.
	 * @param namespace - Plugin namespace
	 * @param updates - Partial metadata to merge
	 */
	updateMetadata(namespace: string, updates: Record<string, unknown>): void
}

export default {}
