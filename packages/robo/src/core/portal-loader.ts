import { Manifest } from './manifest-api.js'
import { portal } from './portal-impl.js'
import { logger } from './logger.js'
import { getConfig } from './config.js'
import type { HandlerRecord } from '../types/common.js'

export interface PopulateOptions {
	/** Force eager loading regardless of mode */
	eager?: boolean
}

// Extended portal interface for internal methods
interface PortalInternal {
	initialize(mode: string): Promise<void>
	registerNamespace(namespace: string, routes: string[]): void
	registerSingularName(namespace: string, routeName: string, singularName: string): void
}

/**
 * Populate the portal from the manifest.
 * Called during Robo.start() after manifest is initialized.
 *
 * @param mode - Runtime mode ('development', 'production', or custom)
 * @param options - Population options
 */
export async function populatePortal(mode: string, options?: PopulateOptions): Promise<void> {
	const config = getConfig()

	// Determine loading strategy:
	// 1. Options override
	// 2. Config setting (portal.loading)
	// 3. Default based on mode
	// 4. Force lazy loading in mock/test mode to avoid Jest ESM module linking issues
	let eager: boolean
	if (options?.eager !== undefined) {
		eager = options.eager
	} else if (config?.portal?.loading) {
		eager = config.portal.loading === 'eager'
	} else if (process.env.ROBO_MOCK_MODE === 'true') {
		eager = false
	} else {
		eager = mode === 'production'
	}

	// Initialize portal
	const portalInternal = portal as unknown as PortalInternal
	await portalInternal.initialize(mode)

	// Get route definitions
	const routeDefs = Manifest.routeDefinitions()

	logger.debug(`Populating portal from manifest (${eager ? 'eager' : 'lazy'} loading)`)

	// Phase 1: Register namespaces and collect route work (no I/O needed)
	const routeWork: Array<{ namespace: string; routeName: string }> = []

	for (const [namespace, namespaceConfig] of Object.entries(routeDefs)) {
		logger.debug(`Processing namespace: ${namespace}`)

		const routeNames = Object.keys(namespaceConfig.routes)
		portalInternal.registerNamespace(namespace, routeNames)

		for (const [routeName, routeConfig] of Object.entries(namespaceConfig.routes)) {
			if (routeConfig.singular) {
				portalInternal.registerSingularName(namespace, routeName, routeConfig.singular)
			}
			routeWork.push({ namespace, routeName })
		}
	}

	if (eager) {
		await Promise.all(routeWork.map(({ namespace, routeName }) => portal.ensureRoute(namespace, routeName)))
		await Promise.all(
			routeWork.map(async ({ namespace, routeName }) => {
				const handlers = portal.getByType(`${namespace}:${routeName}`)
				await importAllHandlers(namespace, routeName, handlers)
			})
		)
	}

	logger.debug('Portal population complete')
}

/**
 * Import all handlers eagerly.
 * Used in production mode for faster runtime access.
 */
async function importAllHandlers(
	namespace: string,
	route: string,
	handlers: Record<string, HandlerRecord | HandlerRecord[]>
): Promise<void> {
	const importPromises: Promise<void>[] = []

	for (const [key, recordOrArray] of Object.entries(handlers)) {
		const records = Array.isArray(recordOrArray) ? recordOrArray : [recordOrArray]

		for (let i = 0; i < records.length; i++) {
			const record = records[i]
			const importKey = records.length > 1 ? `${key}[${i}]` : key
			importPromises.push(
				portal.importRecord(record).catch((error) => {
					logger.error(`Failed to import handler ${namespace}.${route}['${importKey}']:`, error)
				})
			)
		}
	}

	await Promise.all(importPromises)
}

/**
 * Reload a specific route in the portal.
 * Called by HMR when files change.
 */
export async function reloadPortalRoute(namespace: string, route: string): Promise<void> {
	await portal.reloadRoute(namespace, route)
	logger.debug(`Reloaded portal route: ${namespace}.${route}`)
}

/**
 * Clear the portal and re-populate from manifest.
 * Called when the entire manifest needs to be reloaded.
 */
export async function repopulatePortal(mode: string, options?: PopulateOptions): Promise<void> {
	portal.clearCache()
	await populatePortal(mode, options)
}
