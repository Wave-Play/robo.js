/**
 * Portal
 *
 * Re-exports the namespace-based portal implementation.
 * Provides lazy-loaded, typed access to handlers and controllers.
 */

import { getConfig } from './config.js'

// Re-export the portal singleton, types, and utilities
export { portal, PortalImpl, createScopedPortal } from './portal-impl.js'
export type { Portal } from './portal-impl.js'
export { populatePortal, reloadPortalRoute, repopulatePortal } from './portal-loader.js'

/**
 * Gets the config options for a specific plugin package.
 *
 * @param packageName The name of the package to get the options for.
 * @returns The options for the package, or null if the package is not installed nor configured.
 */
export function getPluginOptions(packageName: string): unknown | null {
	const config = getConfig()
	const pluginOptions = config?.plugins?.find((plugin) => {
		return (typeof plugin === 'string' ? plugin : plugin[0]) === packageName
	})
	const options = typeof pluginOptions === 'string' ? null : pluginOptions?.[1]

	return options ?? null
}
