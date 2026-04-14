/**
 * Phase 7: Schema Metadata Tests
 *
 * Tests for SchemaMetadataManager which handles schema metadata
 * persistence and versioning.
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { SchemaMetadataManager } from '../../src/migrations/metadata.js'
import { MemoryAdapter } from 'robo.js/flashcore'
import type { SchemaMetadata, SchemaSnapshot, FieldMetadata } from '../../src/migrations/types.js'

describe('SchemaMetadataManager', () => {
	let adapter: MemoryAdapter
	let manager: SchemaMetadataManager

	beforeEach(async () => {
		adapter = new MemoryAdapter()
		await adapter.init?.()
		manager = new SchemaMetadataManager(adapter)
	})

	// Helper to create complete FieldMetadata
	function createField(
		name: string,
		overrides: Partial<FieldMetadata> = {}
	): FieldMetadata {
		return {
			name,
			type: 'string',
			optional: false,
			unique: false,
			indexed: false,
			indexTypes: [],
			primaryKey: false,
			version: false,
			hasDefault: false,
			...overrides
		}
	}

	describe('getModelMetadata', () => {
		it('should return null for non-existent model', async () => {
			const result = await manager.getModelMetadata('NonExistent')
			expect(result).toBeNull()
		})

		it('should return metadata for existing model', async () => {
			const metadata: SchemaMetadata = {
				version: 1,
				checksum: 'abc123',
				fields: {
					id: createField('id', { unique: true }),
					name: createField('name', { optional: true })
				},
				relations: {},
				migratedAt: new Date().toISOString(),
				migrationHistory: []
			}

			await manager.setModelMetadata('User', metadata)
			const result = await manager.getModelMetadata('User')

			expect(result).toEqual(metadata)
		})
	})

	describe('setModelMetadata', () => {
		it('should persist model metadata', async () => {
			const metadata: SchemaMetadata = {
				version: 1,
				checksum: 'xyz789',
				fields: {
					id: createField('id', { unique: true })
				},
				relations: {},
				migratedAt: new Date().toISOString(),
				migrationHistory: []
			}

			await manager.setModelMetadata('Post', metadata)

			// Verify it was persisted
			const result = await manager.getModelMetadata('Post')
			expect(result).toEqual(metadata)
		})

		it('should update existing metadata', async () => {
			const v1: SchemaMetadata = {
				version: 1,
				checksum: 'v1',
				fields: {
					id: createField('id', { unique: true })
				},
				relations: {},
				migratedAt: new Date().toISOString(),
				migrationHistory: []
			}

			const v2: SchemaMetadata = {
				version: 2,
				checksum: 'v2',
				fields: {
					id: createField('id', { unique: true }),
					email: createField('email', { unique: true })
				},
				relations: {},
				migratedAt: new Date().toISOString(),
				migrationHistory: ['migration_1']
			}

			await manager.setModelMetadata('User', v1)
			await manager.setModelMetadata('User', v2)

			const result = await manager.getModelMetadata('User')
			expect(result).toEqual(v2)
		})
	})

	describe('getSnapshot', () => {
		it('should return null for non-existent namespace', async () => {
			const result = await manager.getSnapshot('nonexistent')
			expect(result).toBeNull()
		})

		it('should return snapshot for existing namespace', async () => {
			const snapshot: SchemaSnapshot = {
				namespace: 'default',
				version: 1,
				checksum: 'snapshot123',
				models: {
					User: {
						version: 1,
						checksum: 'user123',
						fields: {
							id: createField('id', { unique: true })
						},
						relations: {},
						migratedAt: new Date().toISOString(),
						migrationHistory: []
					}
				},
				createdAt: new Date().toISOString()
			}

			await manager.setSnapshot(snapshot, 'default')
			const result = await manager.getSnapshot('default')

			expect(result).toEqual(snapshot)
		})
	})

	describe('setSnapshot', () => {
		it('should persist namespace snapshot', async () => {
			const snapshot: SchemaSnapshot = {
				namespace: 'custom',
				version: 3,
				checksum: 'custom123',
				models: {},
				createdAt: new Date().toISOString()
			}

			await manager.setSnapshot(snapshot, 'custom')

			const result = await manager.getSnapshot('custom')
			expect(result).toEqual(snapshot)
		})
	})

	describe('deleteModelMetadata', () => {
		it('should delete existing metadata', async () => {
			const metadata: SchemaMetadata = {
				version: 1,
				checksum: 'abc',
				fields: {},
				relations: {},
				migratedAt: new Date().toISOString(),
				migrationHistory: []
			}

			await manager.setModelMetadata('ToDelete', metadata)
			await manager.deleteModelMetadata('ToDelete')

			const result = await manager.getModelMetadata('ToDelete')
			expect(result).toBeNull()
		})

		it('should not error when deleting non-existent metadata', async () => {
			await expect(manager.deleteModelMetadata('NonExistent')).resolves.not.toThrow()
		})
	})

	describe('hasModelMetadata', () => {
		it('should return false for non-existent model', async () => {
			const result = await manager.hasModelMetadata('NonExistent')
			expect(result).toBe(false)
		})

		it('should return true for existing model', async () => {
			const metadata: SchemaMetadata = {
				version: 1,
				checksum: 'abc',
				fields: {},
				relations: {},
				migratedAt: new Date().toISOString(),
				migrationHistory: []
			}

			await manager.setModelMetadata('Exists', metadata)

			const result = await manager.hasModelMetadata('Exists')
			expect(result).toBe(true)
		})
	})

	describe('static helper methods', () => {
		it('computeCombinedChecksum should produce deterministic checksum', () => {
			const models: Record<string, SchemaMetadata> = {
				User: {
					version: 1,
					checksum: 'user123',
					fields: {},
					relations: {},
					migratedAt: new Date().toISOString(),
					migrationHistory: []
				},
				Post: {
					version: 1,
					checksum: 'post456',
					fields: {},
					relations: {},
					migratedAt: new Date().toISOString(),
					migrationHistory: []
				}
			}

			const checksum1 = SchemaMetadataManager.computeCombinedChecksum(models)
			const checksum2 = SchemaMetadataManager.computeCombinedChecksum(models)

			expect(checksum1).toBe(checksum2)
			expect(typeof checksum1).toBe('string')
			expect(checksum1.length).toBe(8)
		})

		it('createSnapshot should create valid snapshot', () => {
			const models: Record<string, SchemaMetadata> = {
				User: {
					version: 1,
					checksum: 'user123',
					fields: {},
					relations: {},
					migratedAt: new Date().toISOString(),
					migrationHistory: []
				}
			}

			const snapshot = SchemaMetadataManager.createSnapshot(models, 'default', 1)

			expect(snapshot.version).toBe(1)
			expect(snapshot.namespace).toBe('default')
			expect(snapshot.models).toEqual(models)
			expect(snapshot.checksum).toBeDefined()
			expect(snapshot.createdAt).toBeDefined()
		})
	})
})
