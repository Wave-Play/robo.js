/**
 * Tests for the manifest loader singleton.
 *
 * Tests the loading algorithm with pinned manifest fallback.
 * Live extraction is not tested here (requires SDK installed).
 */

import {
	loadManifest,
	getManifest,
	isManifestLoaded,
	getCommandMap,
	getEventMap,
	resetManifest
} from '../../../src/activity/schema/manifest-loader.js'

describe('Manifest Loader', () => {
	beforeEach(() => {
		// Reset singleton state between tests
		resetManifest()
	})

	test('isManifestLoaded returns false initially', () => {
		expect(isManifestLoaded()).toBe(false)
	})

	test('getManifest throws before loadManifest is called', () => {
		expect(() => getManifest()).toThrow('RPC manifest has not been loaded')
	})

	test('getCommandMap throws before loadManifest is called', () => {
		expect(() => getCommandMap()).toThrow('RPC manifest has not been loaded')
	})

	test('getEventMap throws before loadManifest is called', () => {
		expect(() => getEventMap()).toThrow('RPC manifest has not been loaded')
	})

	test('loadManifest returns a valid manifest', () => {
		// Without SDK installed, should fall back to pinned manifest
		const manifest = loadManifest()

		expect(manifest).toBeDefined()
		expect(manifest.manifest_version).toBe(1)
		expect(manifest.sdk_version).toBeTruthy()
		expect(manifest.extracted_at).toBeTruthy()
		expect(Array.isArray(manifest.commands)).toBe(true)
		expect(Array.isArray(manifest.events)).toBe(true)
	})

	test('isManifestLoaded returns true after loading', () => {
		loadManifest()
		expect(isManifestLoaded()).toBe(true)
	})

	test('getManifest returns same manifest after loading', () => {
		const loaded = loadManifest()
		const retrieved = getManifest()
		expect(retrieved).toBe(loaded)
	})

	test('falls back to pinned manifest when SDK not installed', () => {
		// Use a non-existent path to ensure SDK can't be found
		const manifest = loadManifest('/nonexistent/path')
		expect(manifest.source).toBe('pinned')
	})

	test('pinned manifest has source = pinned', () => {
		const manifest = loadManifest('/nonexistent/path')
		expect(manifest.source).toBe('pinned')
	})

	test('getCommandMap returns correct lookup', () => {
		loadManifest()
		const cmdMap = getCommandMap()

		expect(cmdMap).toBeInstanceOf(Map)
		expect(cmdMap.size).toBeGreaterThan(0)

		// Check a known command
		const authorize = cmdMap.get('AUTHORIZE')
		expect(authorize).toBeDefined()
		expect(authorize!.name).toBe('AUTHORIZE')
		expect(authorize!.category).toBe('auth')
	})

	test('getEventMap returns correct lookup', () => {
		loadManifest()
		const evtMap = getEventMap()

		expect(evtMap).toBeInstanceOf(Map)
		expect(evtMap.size).toBeGreaterThan(0)

		// Check a known event
		const ready = evtMap.get('READY')
		expect(ready).toBeDefined()
		expect(ready!.name).toBe('READY')
		expect(ready!.subscribable).toBe(false)
	})

	test('resetManifest clears the singleton', () => {
		loadManifest()
		expect(isManifestLoaded()).toBe(true)

		resetManifest()
		expect(isManifestLoaded()).toBe(false)
		expect(() => getManifest()).toThrow()
	})
})
