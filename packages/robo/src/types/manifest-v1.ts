/**
 * Manifest V1 Type Definitions
 *
 * Types for the granular manifest system that splits the manifest into
 * mode-separated directories with individual JSON files for efficient
 * lazy loading, debugging, and HMR support.
 */

import type { Config } from './config.js'
import type { ProcessedEntry } from './routes.js'

// ============================================================================
// Project Metadata (robo.json)
// ============================================================================

/**
 * Project metadata stored in robo.json.
 * Core information about the Robo project itself.
 */
export interface ProjectMetadata {
	/** Project name from package.json */
	name: string
	/** Project version */
	version: string
	/** Source language: typescript or javascript */
	language: 'typescript' | 'javascript'
	/** Robo.js version used to build */
	roboVersion: string
	/** Which mode this manifest is for */
	mode: 'development' | 'production'
	/** When this manifest was generated (ISO 8601) */
	buildTime: string
	/** Hash for cache invalidation */
	buildHash: string
}

// ============================================================================
// Environment Metadata (env.json)
// ============================================================================

/**
 * Status of a single environment variable.
 * Contains verification info without exposing actual values.
 */
export interface EnvVariableStatus {
	/** Whether the variable is defined in the environment */
	exists: boolean
	/** Whether the value is an empty string */
	empty: boolean
	/** Character count of the value */
	length: number
	/** Validation status */
	pattern: 'valid' | 'empty' | 'missing' | 'invalid'
}

/**
 * Pattern definition for validating environment variables.
 */
export interface EnvPattern {
	/** Human-readable name */
	name: string
	/** Minimum allowed length */
	minLength?: number
	/** Maximum allowed length */
	maxLength?: number
	/** Regex pattern for validation */
	regex?: RegExp
}

/**
 * Environment variable metadata stored in env.json.
 * Useful for debugging configuration issues without exposing secrets.
 */
export interface EnvMetadata {
	/** Status of each environment variable */
	variables: Record<string, EnvVariableStatus>
	/** Summary statistics */
	summary: {
		/** Total number of environment variables checked */
		total: number
		/** Number of variables that are set with values */
		set: number
		/** Number of variables that exist but are empty */
		empty: number
		/** Number of variables that are not defined */
		missing: number
	}
	/** Required variable status */
	required: {
		/** Required variables that are satisfied */
		satisfied: string[]
		/** Required variables that are missing */
		missing: string[]
	}
}

// ============================================================================
// Plugin Registry (plugins.json)
// ============================================================================

/**
 * Information about an installed plugin.
 */
export interface PluginInfo {
	/** Package name */
	name: string
	/** Package version */
	version: string
	/** Path to the plugin (relative to project root) */
	path: string
	/** Plugin's namespace for routes */
	namespace: string
	/** Route names this plugin defines */
	routes: string[]
	/** Hook types this plugin provides */
	hooks: string[]
}

/**
 * Plugin registry stored in plugins.json.
 */
export type PluginRegistry = Record<string, PluginInfo>

// ============================================================================
// Route Definitions (routes/@.json)
// ============================================================================

/**
 * Serialized route configuration for the manifest.
 * Contains only serializable parts of RouteConfig.
 */
export interface RouteDefinitionConfig {
	/** Key generation configuration */
	key: {
		style: 'filename' | 'filepath'
		separator?: string
		nested?: 'camelCase' | 'dotNotation'
	}
	/** Nesting configuration */
	nesting?: {
		maxDepth?: number
		allowIndex?: boolean
		/** Dynamic segment pattern (string form of regex) */
		dynamicSegment?: string
		/** Catch-all pattern (string form of regex) */
		catchAllSegment?: string
		/** Optional catch-all pattern (string form of regex) */
		optionalCatchAll?: string
	}
	/** Export requirements */
	exports?: {
		named?: string[]
		default?: 'required' | 'optional' | 'forbidden'
		config?: 'required' | 'optional' | 'forbidden'
	}
	/** Whether multiple handlers per key are allowed */
	multiple?: boolean
	/** File filter pattern (string form of regex) */
	filter?: string
	/** Human-readable description */
	description?: string
}

/**
 * Route definition with handler and controller info.
 */
export interface RouteDefinition {
	/** Directory this route scans */
	directory: string
	/** Route configuration */
	config: RouteDefinitionConfig
	/** Handler type information */
	handler?: {
		type: string
		import: string
	}
	/** Controller factory information */
	controller?: {
		type: string
		import: string
		factory: string
	}
}

/**
 * Route definitions for a namespace.
 */
export interface NamespaceRouteDefinitions {
	/** Plugin that provides these routes */
	plugin: string
	/** Plugin namespace */
	namespace: string
	/** Route definitions by route name */
	routes: Record<string, RouteDefinition>
}

/**
 * All route definitions stored in routes/@.json.
 */
export type RouteDefinitions = Record<string, NamespaceRouteDefinitions>

// ============================================================================
// Handler Entries (routes/{namespace}.{route}.json)
// ============================================================================

/**
 * A handler entry in the manifest.
 * Extends ProcessedEntry with source tracking.
 */
export interface HandlerEntry extends ProcessedEntry {
	/**
	 * Unique identifier for this entry.
	 * Format: "{key}" for project, "{plugin}:{key}" for plugins
	 * For multiple handlers: append ":{index}"
	 */
	id: string

	/**
	 * Where this handler came from.
	 */
	source: 'project' | 'plugin'

	/**
	 * Plugin name if source is 'plugin', null otherwise.
	 */
	plugin: string | null

	/**
	 * For multiple handlers per key (events), the index.
	 */
	index?: number

	/**
	 * For commands with subcommands, the parent command key.
	 */
	parent?: string
}

// ============================================================================
// Hook Entries (hooks/{hookType}.json)
// ============================================================================

/**
 * A lifecycle hook entry.
 */
export interface HookEntry {
	/** Unique identifier */
	id: string
	/** Where this hook came from */
	source: 'project' | 'plugin'
	/** Plugin name if source is 'plugin' */
	plugin: string | null
	/** Path to the compiled hook file */
	path: string
	/** Execution priority. Lower runs first. */
	priority: number
	/** For build hooks, which phase */
	phase?: 'start' | 'transform' | 'complete'
}

/**
 * All hooks organized by hook type.
 */
export type HooksManifest = Record<string, HookEntry[]>

// ============================================================================
// Metadata Aggregation
// ============================================================================

/**
 * Metadata aggregation index stored in metadata/@.json.
 */
export interface MetadataIndex {
	[namespace: string]: {
		/** Sources that contributed to this namespace's metadata */
		sources: string[]
		/** Filename of the aggregated metadata */
		aggregatedFile: string
		/** When metadata was last aggregated (ISO 8601) */
		lastAggregated: string
	}
}

/**
 * Base interface for aggregated namespace metadata.
 */
export interface AggregatedMetadata {
	/** Namespace this metadata belongs to */
	namespace: string
	/** Sources that contributed to this metadata */
	sources: string[]
}

/**
 * Function that aggregates metadata from handler entries.
 */
export type MetadataAggregator<T extends AggregatedMetadata = AggregatedMetadata> = (
	entries: HandlerEntry[],
	pluginDefaults: Record<string, unknown>
) => T

/**
 * Registry of metadata aggregators by namespace.
 */
export type MetadataAggregatorRegistry = Map<string, MetadataAggregator>

// ============================================================================
// BuildCompleteContext Extensions
// ============================================================================

/**
 * Accessor for route entries in BuildCompleteContext.
 */
export interface EntriesAccessor {
	/**
	 * Get entries for a specific route.
	 */
	get(namespace: string, route: string): ProcessedEntry[]

	/**
	 * Get all entries organized by namespace and route.
	 */
	all(): Map<string, Map<string, ProcessedEntry[]>>

	/**
	 * Get handler entries (with source tracking) for a route.
	 */
	handlers(namespace: string, route: string): HandlerEntry[]
}

// ============================================================================
// Manifest API
// ============================================================================

/**
 * Options for manifest operations.
 */
export interface ManifestOptions {
	/** Override the mode to load from */
	mode?: 'development' | 'production'
}

/**
 * The Manifest API singleton interface.
 * Provides lazy-loaded, type-safe access to manifest data.
 */
export interface ManifestAPI {
	/** Current runtime mode */
	readonly mode: 'development' | 'production'

	/** Whether the manifest has been initialized */
	readonly isInitialized: boolean

	/**
	 * Get route handler entries.
	 * @param namespace - Plugin namespace (e.g., 'discord', 'server')
	 * @param route - Route name (e.g., 'commands', 'api')
	 * @param options - Optional mode override
	 */
	routes(namespace: string, route: string, options?: ManifestOptions): Promise<HandlerEntry[]>

	/**
	 * Get route handler entries synchronously (must be pre-loaded).
	 */
	routesSync(namespace: string, route: string, options?: ManifestOptions): HandlerEntry[]

	/**
	 * Get all route definitions from @.json.
	 */
	routeDefinitions(options?: ManifestOptions): RouteDefinitions

	/**
	 * Get route definitions for a specific namespace.
	 */
	routeDefinitionsForNamespace(namespace: string, options?: ManifestOptions): NamespaceRouteDefinitions | undefined

	/**
	 * Get lifecycle hook entries.
	 */
	hooks(hook: string, options?: ManifestOptions): HookEntry[]

	/**
	 * Get merged config.
	 */
	config(options?: ManifestOptions): Config

	/**
	 * Get config for a specific plugin.
	 */
	pluginConfig(plugin: string, options?: ManifestOptions): Record<string, unknown>

	/**
	 * Get environment variable status.
	 */
	env(options?: ManifestOptions): EnvMetadata

	/**
	 * Get all plugin info.
	 */
	plugins(options?: ManifestOptions): PluginInfo[]

	/**
	 * Get info for a specific plugin.
	 */
	plugin(name: string, options?: ManifestOptions): PluginInfo | undefined

	/**
	 * Get aggregated metadata for a namespace.
	 */
	metadata<T extends AggregatedMetadata = AggregatedMetadata>(
		namespace: string,
		options?: ManifestOptions
	): T | undefined

	/**
	 * Get project metadata.
	 */
	project(options?: ManifestOptions): ProjectMetadata

	// Lazy loading methods

	/**
	 * Check if a route is loaded into memory.
	 */
	isLoaded(namespace: string, route: string): boolean

	/**
	 * Load a route manifest into memory.
	 */
	load(namespace: string, route: string): Promise<HandlerEntry[]>

	/**
	 * Reload a route manifest (for HMR).
	 */
	reload(namespace: string, route: string): Promise<HandlerEntry[]>

	/**
	 * Unload a route manifest (free memory).
	 */
	unload(namespace: string, route: string): void

	/**
	 * Initialize the manifest by preloading core files.
	 * Called during Robo.start().
	 */
	initialize(mode: 'development' | 'production'): Promise<void>

	/**
	 * Clear all cached data (for testing).
	 */
	clearCache(): void
}

// ============================================================================
// Type Generation Maps (for .robo/types/manifest.d.ts)
// ============================================================================

/**
 * Map of namespace to available route names.
 * Extended by generated types.
 */
export interface ManifestRouteMap {
	[namespace: string]: string
}

/**
 * Map of hook types.
 * Extended by generated types.
 */
export interface ManifestHookMap {
	[hookType: string]: HookEntry
}

/**
 * Map of plugin config types.
 * Extended by generated types.
 */
export interface ManifestConfigMap {
	[plugin: string]: Record<string, unknown>
}

/**
 * Map of namespace metadata types.
 * Extended by generated types.
 */
export interface ManifestMetadataMap {
	[namespace: string]: AggregatedMetadata
}

export default {}
