/**
 * Manual mock for robo.js module used by @robojs/sync tests.
 *
 * Provides minimal logger and color utilities needed by the sync plugin.
 */

import { jest } from '@jest/globals'

// Minimal logger stub that supports logger.fork('...').debug/info/warn/error
const baseLogger = {
	debug: jest.fn(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	trace: jest.fn(),
	wait: jest.fn(),
	log: jest.fn(),
	event: jest.fn(),
	ready: jest.fn()
}

export const logger = {
	...baseLogger,
	fork: jest.fn(() => ({ ...baseLogger }))
}

// color utilities - passthrough functions for testing
export const color = {
	bold: (s: string) => s,
	dim: (s: string) => s,
	red: (s: string) => s,
	green: (s: string) => s,
	yellow: (s: string) => s,
	blue: (s: string) => s,
	cyan: (s: string) => s,
	magenta: (s: string) => s,
	white: (s: string) => s,
	gray: (s: string) => s,
	reset: (s: string) => s
}

const routeSummaries: Record<string, Array<Record<string, unknown>>> = {}
const portalData: Record<string, Record<string, unknown>> = {}

export const Manifest = {
	routeSummaries: jest.fn(async (namespace: string, route: string) => routeSummaries[`${namespace}.${route}`] ?? []),
	routeSummariesSync: jest.fn((namespace: string, route: string) => routeSummaries[`${namespace}.${route}`] ?? [])
}

export function setRouteSummaries(namespace: string, route: string, summaries: Array<Record<string, unknown>>): void {
	routeSummaries[`${namespace}.${route}`] = summaries
}

export function clearRouteSummaries(): void {
	Object.keys(routeSummaries).forEach((key) => delete routeSummaries[key])
}

export const portal = {
	getHandler: jest.fn(),
	ensureRoute: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
	getByType: jest.fn((type: string) => portalData[type] ?? {})
}

export function setPortalData(type: string, data: Record<string, unknown>): void {
	portalData[type] = data
}

export function clearPortalData(): void {
	Object.keys(portalData).forEach((key) => delete portalData[key])
}

export default { logger, color, Manifest, portal }
