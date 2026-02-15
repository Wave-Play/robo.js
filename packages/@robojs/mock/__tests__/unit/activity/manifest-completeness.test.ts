/**
 * Schema Completeness Gate Tests
 *
 * These tests verify that:
 * 1. The pinned manifest contains all expected commands and events
 * 2. The manifest structure is valid
 * 3. Command/event name lists are stable for pinned SDK version (snapshot)
 * 4. Every command has the required fields
 * 5. Every event has the required fields
 *
 * When Discord updates the SDK with new commands/events, these tests
 * will fail until the pinned manifest is regenerated and handlers
 * are added for the new surface area.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RpcManifest } from '../../../src/activity/schema/manifest-types.js'

describe('RPC Manifest Schema Completeness', () => {
	let manifest: RpcManifest

	beforeAll(() => {
		const raw = readFileSync(
			resolve(__dirname, '../../../src/activity/schema/pinned/latest.json'),
			'utf-8'
		)
		manifest = JSON.parse(raw)
	})

	// ========================================================================
	// Structure validation
	// ========================================================================

	test('manifest has valid structure', () => {
		expect(manifest.manifest_version).toBe(1)
		expect(manifest.sdk_version).toBeTruthy()
		expect(manifest.extracted_at).toBeTruthy()
		expect(Array.isArray(manifest.commands)).toBe(true)
		expect(Array.isArray(manifest.events)).toBe(true)
	})

	test('manifest has non-empty commands', () => {
		expect(manifest.commands.length).toBeGreaterThan(0)
	})

	test('manifest has non-empty events', () => {
		expect(manifest.events.length).toBeGreaterThan(0)
	})

	// ========================================================================
	// Command validation
	// ========================================================================

	test('every command has required fields', () => {
		for (const cmd of manifest.commands) {
			expect(cmd.name).toBeTruthy()
			expect(typeof cmd.name).toBe('string')
			expect(cmd.name).toMatch(/^[A-Z_]+$/) // SCREAMING_SNAKE_CASE
			expect(cmd.category).toBeTruthy()
			// auth_required may be null
			expect([true, false, null]).toContain(cmd.auth_required)
		}
	})

	test('no duplicate command names', () => {
		const names = manifest.commands.map((c) => c.name)
		expect(new Set(names).size).toBe(names.length)
	})

	// ========================================================================
	// Event validation
	// ========================================================================

	test('every event has required fields', () => {
		for (const evt of manifest.events) {
			expect(evt.name).toBeTruthy()
			expect(typeof evt.name).toBe('string')
			expect(evt.name).toMatch(/^[A-Z_]+$/)
			expect(typeof evt.subscribable).toBe('boolean')
			expect(typeof evt.snapshot_on_subscribe).toBe('boolean')
		}
	})

	test('no duplicate event names', () => {
		const names = manifest.events.map((e) => e.name)
		expect(new Set(names).size).toBe(names.length)
	})

	test('READY is non-subscribable', () => {
		const ready = manifest.events.find((e) => e.name === 'READY')
		expect(ready).toBeDefined()
		expect(ready!.subscribable).toBe(false)
	})

	// ========================================================================
	// Snapshot tests (stable for pinned version)
	// ========================================================================

	test('command names match snapshot', () => {
		const names = manifest.commands.map((c) => c.name).sort()
		expect(names).toMatchSnapshot()
	})

	test('event names match snapshot', () => {
		const names = manifest.events.map((e) => e.name).sort()
		expect(names).toMatchSnapshot()
	})

	// ========================================================================
	// Minimum expected surface area
	// ========================================================================

	test('includes core handshake/auth commands', () => {
		const names = new Set(manifest.commands.map((c) => c.name))
		// These MUST exist for any Activity to work
		expect(names.has('AUTHORIZE')).toBe(true)
		expect(names.has('AUTHENTICATE')).toBe(true)
		expect(names.has('SUBSCRIBE')).toBe(true)
		expect(names.has('UNSUBSCRIBE')).toBe(true)
	})

	test('includes core context commands', () => {
		const names = new Set(manifest.commands.map((c) => c.name))
		expect(names.has('GET_USER')).toBe(true)
		expect(names.has('GET_CHANNEL')).toBe(true)
		expect(names.has('GET_PLATFORM_BEHAVIORS')).toBe(true)
		expect(names.has('GET_CHANNEL_PERMISSIONS')).toBe(true)
	})

	test('includes READY event', () => {
		const names = new Set(manifest.events.map((e) => e.name))
		expect(names.has('READY')).toBe(true)
	})

	test('includes voice signal events', () => {
		const names = new Set(manifest.events.map((e) => e.name))
		expect(names.has('SPEAKING_START')).toBe(true)
		expect(names.has('SPEAKING_STOP')).toBe(true)
		expect(names.has('VOICE_STATE_UPDATE')).toBe(true)
		expect(names.has('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE')).toBe(true)
	})

	// ========================================================================
	// Expected counts (for SDK ~v1.4.x)
	// ========================================================================

	test('has expected number of commands (30+)', () => {
		expect(manifest.commands.length).toBeGreaterThanOrEqual(30)
	})

	test('has expected number of events (14)', () => {
		expect(manifest.events.length).toBeGreaterThanOrEqual(14)
	})
})
