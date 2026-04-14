/**
 * Phase 7: Schema History Tests
 *
 * Tests for SchemaHistoryManager which maintains an append-only
 * history of schema changes.
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { SchemaHistoryManager } from '../../src/migrations/history.js'
import { MemoryAdapter } from 'robo.js/flashcore'
import type { SchemaHistoryEntry, SchemaChange } from '../../src/migrations/types.js'

describe('SchemaHistoryManager', () => {
	let adapter: MemoryAdapter
	let manager: SchemaHistoryManager

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		await adapter.init?.()
		manager = new SchemaHistoryManager(adapter)
	})

	// Helper to create a valid history entry
	function createEntry(
		version: number,
		checksum: string,
		changes: SchemaChange[] = [],
		appliedBy: 'auto' | 'migration' = 'auto',
		migrationName?: string
	): SchemaHistoryEntry {
		return {
			version,
			checksum,
			changes,
			appliedAt: new Date().toISOString(),
			appliedBy,
			migrationName
		}
	}

	describe('getHistory', () => {
		it('should return empty array for namespace with no history', async () => {
			const history = await manager.getHistory('nonexistent')
			expect(history).toEqual([])
		})

		it('should return history entries in order', async () => {
			const entry1 = createEntry(1, 'v1')
			const entry2 = createEntry(2, 'v2')

			await manager.appendHistory(entry1, 'default')
			await manager.appendHistory(entry2, 'default')

			const history = await manager.getHistory('default')

			expect(history).toHaveLength(2)
			expect(history[0].version).toBe(1)
			expect(history[1].version).toBe(2)
		})
	})

	describe('appendHistory', () => {
		it('should append entry to existing history', async () => {
			const entry1 = createEntry(1, 'initial')
			const entry2 = createEntry(2, 'updated', [], 'migration', 'add_email_field')

			await manager.appendHistory(entry1, 'default')
			await manager.appendHistory(entry2, 'default')

			const history = await manager.getHistory('default')

			expect(history).toHaveLength(2)
			expect(history[1].migrationName).toBe('add_email_field')
		})

		it('should maintain separate histories for different namespaces', async () => {
			const entry1 = createEntry(1, 'ns1')
			const entry2 = createEntry(1, 'ns2')

			await manager.appendHistory(entry1, 'namespace1')
			await manager.appendHistory(entry2, 'namespace2')

			const history1 = await manager.getHistory('namespace1')
			const history2 = await manager.getHistory('namespace2')

			expect(history1).toHaveLength(1)
			expect(history1[0].checksum).toBe('ns1')

			expect(history2).toHaveLength(1)
			expect(history2[0].checksum).toBe('ns2')
		})
	})

	describe('diffVersions', () => {
		beforeEach(async () => {
			// Set up history with multiple versions
			const changes1: SchemaChange[] = []
			const changes2: SchemaChange[] = [
				{ type: 'add_field', model: 'User', field: 'email', description: 'Add email', safe: true },
				{ type: 'add_field', model: 'User', field: 'name', description: 'Add name', safe: true }
			]
			const changes3: SchemaChange[] = [
				{ type: 'remove_field', model: 'User', field: 'oldField', description: 'Remove oldField', safe: false }
			]

			await manager.appendHistory(createEntry(1, 'v1', changes1), 'default')
			await manager.appendHistory(createEntry(2, 'v2', changes2), 'default')
			await manager.appendHistory(createEntry(3, 'v3', changes3, 'migration', 'breaking_migration'), 'default')
		})

		it('should return diff between versions', async () => {
			const diff = await manager.diffVersions(1, 3, 'default')

			expect(diff).not.toBeNull()
			expect(diff!.from.version).toBe(1)
			expect(diff!.to.version).toBe(3)
		})

		it('should return null for non-existent versions', async () => {
			const diff = await manager.diffVersions(1, 100, 'default')
			expect(diff).toBeNull()
		})

		it('should return valid diff for same version', async () => {
			const diff = await manager.diffVersions(2, 2, 'default')

			expect(diff).not.toBeNull()
			expect(diff!.from.version).toBe(2)
			expect(diff!.to.version).toBe(2)
		})
	})

	describe('getVersion', () => {
		it('should return 0 for namespace with no history', async () => {
			const version = await manager.getVersion('empty')
			expect(version).toBe(0)
		})

		it('should return latest version number', async () => {
			await manager.appendHistory(createEntry(1, 'v1'), 'default')
			await manager.appendHistory(createEntry(5, 'v5'), 'default')

			const version = await manager.getVersion('default')
			expect(version).toBe(5)
		})
	})

	describe('clearHistory', () => {
		it('should clear all history for a namespace', async () => {
			await manager.appendHistory(createEntry(1, 'v1'), 'toClear')
			await manager.clearHistory('toClear')

			const history = await manager.getHistory('toClear')
			expect(history).toHaveLength(0)
		})

		it('should not affect other namespaces', async () => {
			await manager.appendHistory(createEntry(1, 'keep'), 'keep')
			await manager.appendHistory(createEntry(1, 'clear'), 'clear')

			await manager.clearHistory('clear')

			const kept = await manager.getHistory('keep')
			expect(kept).toHaveLength(1)
		})
	})

	describe('static helper methods', () => {
		it('createAutoEntry should create entry with appliedBy auto', () => {
			const changes: SchemaChange[] = [
				{ type: 'add_field', model: 'User', field: 'email', description: 'Add email', safe: true }
			]

			const entry = SchemaHistoryManager.createAutoEntry(1, 'checksum', changes)

			expect(entry.version).toBe(1)
			expect(entry.checksum).toBe('checksum')
			expect(entry.changes).toEqual(changes)
			expect(entry.appliedBy).toBe('auto')
			expect(entry.appliedAt).toBeDefined()
		})

		it('createMigrationEntry should create entry with migration name', () => {
			const changes: SchemaChange[] = []

			const entry = SchemaHistoryManager.createMigrationEntry(2, 'checksum', changes, 'my_migration')

			expect(entry.version).toBe(2)
			expect(entry.appliedBy).toBe('migration')
			expect(entry.migrationName).toBe('my_migration')
		})
	})

	describe('formatHistory', () => {
		it('should format empty history', () => {
			const formatted = SchemaHistoryManager.formatHistory([])
			expect(formatted).toContain('No history')
		})

		it('should format history entries', () => {
			const entries: SchemaHistoryEntry[] = [
				createEntry(1, 'abc123'),
				createEntry(2, 'def456', [], 'migration', 'test_migration')
			]

			const formatted = SchemaHistoryManager.formatHistory(entries)

			expect(formatted).toContain('v1')
			expect(formatted).toContain('v2')
			expect(formatted).toContain('abc123')
			expect(formatted).toContain('test_migration')
		})
	})
})
