import type { HandlerModule, HandlerRecord } from './common.js'

/**
 * Portal namespace definitions.
 * Auto-generated based on installed plugins' route definitions.
 * This interface is augmented by `.robo/types/portal.d.ts` during build.
 */
export interface PortalNamespaces {
	// Populated by type generation during build
}

/**
 * Controller for module-level enable/disable operations.
 * Modules are cross-cutting - they can span multiple namespaces.
 */
export interface ModuleController {
	/** Check if the module is enabled */
	isEnabled(): boolean
	/** Enable or disable all handlers in this module */
	setEnabled(value: boolean): void
}

/**
 * Controller factory function type.
 * Plugins export these from route files to provide namespace-specific controller methods.
 */
export type ControllerFactory<T = unknown> = (
	key: string,
	record: HandlerRecord,
	pluginState: unknown
) => T

/**
 * Internal module state tracking.
 */
export interface ModuleState {
	enabled: boolean
}

/**
 * Route configuration from manifest.
 */
export interface PortalRouteConfig {
	/** Whether this route supports multiple handlers per key (like events) */
	multiple?: boolean
	/** Singular accessor name (e.g., 'command' for 'commands' route) */
	singular?: string
	/** Controller factory path (e.g., 'plugin-path#factoryName') */
	controller?: {
		factory?: string
	}
}

/**
 * Namespace configuration from manifest.
 */
export interface PortalNamespaceConfig {
	routes: Record<string, PortalRouteConfig>
}

/**
 * Scoped portal for plugins.
 * Only includes routes defined by the plugin.
 */
export interface ScopedPortal {
	[routeName: string]: Record<string, HandlerRecord | HandlerRecord[]> | ((key: string) => unknown)
}

/**
 * The Portal API interface.
 * Provides namespace-based access to handlers and controllers.
 */
export interface PortalAPI extends PortalNamespaces {
	/** Current runtime mode */
	readonly mode: string

	/** Whether the portal has been initialized */
	readonly isInitialized: boolean

	/** Get a module controller for cross-cutting enable/disable */
	module(name: string): ModuleController

	/** Get all handler records across all namespaces */
	all(): HandlerRecord[]

	/** Get handlers by type string (e.g., 'discord:commands') */
	getByType(type: string): Record<string, HandlerRecord | HandlerRecord[]>

	/** Register a namespace with its route names */
	registerNamespace(namespace: string, routes: string[]): void

	/** Register a route's handlers */
	registerRoute(
		namespace: string,
		routeName: string,
		handlers: Record<string, HandlerRecord | HandlerRecord[]>
	): void

	/** Register a controller factory */
	registerController(
		namespace: string,
		routeName: string,
		factory: ControllerFactory
	): void

	/** Register plugin state for controller context */
	registerPluginState(namespace: string, state: unknown): void

	/** Import a handler lazily */
	importHandler(namespace: string, route: string, key: string): Promise<void>

	/** Get handler with auto-import */
	getHandler<T = unknown>(
		namespace: string,
		route: string,
		key: string
	): Promise<HandlerModule<T>>

	/** Get record without importing */
	getRecord(
		namespace: string,
		route: string,
		key: string
	): HandlerRecord | undefined

	/** Get controller for a handler */
	getController<C = unknown>(
		namespace: string,
		route: string,
		key: string
	): C

	/** Ensure a route's manifest is loaded */
	ensureRoute(namespace: string, route: string): Promise<void>

	/** Reload a handler (for HMR) */
	reloadHandler(namespace: string, route: string, key: string): Promise<void>

	/** Reload all handlers in a route (for HMR) */
	reloadRoute(namespace: string, route: string): Promise<void>

	/** Clear all cached data */
	clearCache(): void
}

/**
 * Create a scoped portal for a plugin.
 * Only includes routes defined by that plugin.
 */
export type CreateScopedPortal = (
	pluginName: string,
	routes: Array<{ name: string; singular?: string }>,
	namespace: string
) => ScopedPortal
