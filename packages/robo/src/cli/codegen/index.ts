/**
 * Code Generation Module
 *
 * Provides utilities for generating TypeScript type definitions
 * based on the project's plugins and route definitions.
 */

export {
	extractRouteTypes,
	checkIfMultiple,
	type RouteTypes,
	type TypeExport
} from './extract-route-types.js'

export {
	generatePortalTypes,
	generateTypesIndex,
	collectPluginRoutes,
	type PluginRoutes,
	type RouteInfo
} from './portal-types.js'
