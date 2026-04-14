/**
 * Flashcore v1 (spec rev 4.3) Phase 8 - Version Field Tests
 *
 * Tests auto-injected _version field behavior and overflow protection.
 */

import { FlashcoreSystem } from '../../../src/flashcore/core/system.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'
import { f } from '../../../src/flashcore/schema/field.js'
import { VERSION_FIELD_NAME, MAX_VERSION_VALUE, VERSION_OVERFLOW_WARN_THRESHOLD } from '../../../src/flashcore/core/constants.js'

interface Document {
	id: string
	title: string
	content: string
	_version?: number
}

interface VersionedUser {
	id: string
	name: string
	_version?: number
}

describe('Version Field Behavior', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
		await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
	})

	describe('Constants', () => {
		it('should have correct VERSION_FIELD_NAME', () => {
			expect(VERSION_FIELD_NAME).toBe('_version')
		})

		it('should have correct MAX_VERSION_VALUE', () => {
			expect(MAX_VERSION_VALUE).toBe(Number.MAX_SAFE_INTEGER)
		})

		it('should have overflow threshold at 90%', () => {
			expect(VERSION_OVERFLOW_WARN_THRESHOLD).toBe(Math.floor(MAX_VERSION_VALUE * 0.9))
		})
	})

	describe('Version Field Initialization', () => {
		it('should initialize _version to 0 on create', async () => {
			const Doc = FlashcoreSystem.registerModel<Document>('Doc', {
				id: f.id(),
				title: f.string(),
				content: f.string(),
				_version: f.number().version()
			})

			const created = await Doc.create({ title: 'Test', content: 'Content' })

			expect(created._version).toBe(0)
		})

		it('should preserve explicit _version value on create', async () => {
			const Doc = FlashcoreSystem.registerModel<Document>('Doc', {
				id: f.id(),
				title: f.string(),
				content: f.string(),
				_version: f.number().version()
			})

			const created = await Doc.create({ title: 'Test', content: 'Content', _version: 5 })

			expect(created._version).toBe(5)
		})

		it('should work with createMany', async () => {
			const Doc = FlashcoreSystem.registerModel<Document>('Doc', {
				id: f.id(),
				title: f.string(),
				content: f.string(),
				_version: f.number().version()
			})

			const result = await Doc.createMany({
				data: [
					{ title: 'Doc 1', content: 'Content 1' },
					{ title: 'Doc 2', content: 'Content 2' },
					{ title: 'Doc 3', content: 'Content 3' }
				]
			})

			expect(result.records[0]._version).toBe(0)
			expect(result.records[1]._version).toBe(0)
			expect(result.records[2]._version).toBe(0)
		})
	})

	describe('Version Increment on Update', () => {
		it('should increment _version on update', async () => {
			const Doc = FlashcoreSystem.registerModel<Document>('Doc', {
				id: f.id(),
				title: f.string(),
				content: f.string(),
				_version: f.number().version()
			})

			const created = await Doc.create({ id: 'doc-1', title: 'Original', content: 'Content' })
			expect(created._version).toBe(0)

			const updated = await Doc.update({
				where: { id: 'doc-1' },
				data: { title: 'Updated' }
			})

			expect(updated?._version).toBe(1)
		})

		it('should increment on each update', async () => {
			const Doc = FlashcoreSystem.registerModel<Document>('Doc', {
				id: f.id(),
				title: f.string(),
				content: f.string(),
				_version: f.number().version()
			})

			await Doc.create({ id: 'doc-1', title: 'v0', content: 'Content' })

			let doc = await Doc.update({ where: { id: 'doc-1' }, data: { title: 'v1' } })
			expect(doc?._version).toBe(1)

			doc = await Doc.update({ where: { id: 'doc-1' }, data: { title: 'v2' } })
			expect(doc?._version).toBe(2)

			doc = await Doc.update({ where: { id: 'doc-1' }, data: { title: 'v3' } })
			expect(doc?._version).toBe(3)
		})

		it('should not increment if update data includes explicit _version', async () => {
			const Doc = FlashcoreSystem.registerModel<Document>('Doc', {
				id: f.id(),
				title: f.string(),
				content: f.string(),
				_version: f.number().version()
			})

			await Doc.create({ id: 'doc-1', title: 'Original', content: 'Content' })

			const updated = await Doc.update({
				where: { id: 'doc-1' },
				data: { title: 'Updated', _version: 100 }
			})

			expect(updated?._version).toBe(100)
		})
	})

	describe('Schema Definition', () => {
		it('should support version() modifier on int field', async () => {
			const User = FlashcoreSystem.registerModel<VersionedUser>('User', {
				id: f.id(),
				name: f.string(),
				_version: f.number().version()
			})

			const schema = User.getSchema()
			expect(schema.has('_version')).toBe(true)
		})

		it('should work with optional version field', async () => {
			interface OptionalVersion {
				id: string
				name: string
				_version?: number
			}

			const User = FlashcoreSystem.registerModel<OptionalVersion>('User', {
				id: f.id(),
				name: f.string(),
				_version: f.number().optional().version()
			})

			// Create without version
			const created = await User.create({ name: 'Test' })
			expect(created._version).toBe(0) // Should still be initialized
		})
	})

	describe('updateMany with Versions', () => {
		it('should increment versions for all updated records', async () => {
			const Doc = FlashcoreSystem.registerModel<Document>('Doc', {
				id: f.id(),
				title: f.string(),
				content: f.string(),
				_version: f.number().version()
			})

			await Doc.create({ id: 'doc-1', title: 'Doc 1', content: 'Content' })
			await Doc.create({ id: 'doc-2', title: 'Doc 2', content: 'Content' })
			await Doc.create({ id: 'doc-3', title: 'Doc 3', content: 'Other' })

			await Doc.updateMany({
				where: { content: 'Content' },
				data: { content: 'Updated Content' }
			})

			const doc1 = await Doc.findUnique({ where: { id: 'doc-1' } })
			const doc2 = await Doc.findUnique({ where: { id: 'doc-2' } })
			const doc3 = await Doc.findUnique({ where: { id: 'doc-3' } })

			expect(doc1?._version).toBe(1)
			expect(doc2?._version).toBe(1)
			expect(doc3?._version).toBe(0) // Not updated
		})
	})

	describe('Upsert with Versions', () => {
		it('should initialize version on create path', async () => {
			const Doc = FlashcoreSystem.registerModel<Document>('Doc', {
				id: f.id(),
				title: f.string(),
				content: f.string(),
				_version: f.number().version()
			})

			const result = await Doc.upsert({
				where: { id: 'new-doc' },
				create: { id: 'new-doc', title: 'New', content: 'Content' },
				update: { title: 'Updated' }
			})

			expect(result._version).toBe(0)
		})

		it('should increment version on update path', async () => {
			const Doc = FlashcoreSystem.registerModel<Document>('Doc', {
				id: f.id(),
				title: f.string(),
				content: f.string(),
				_version: f.number().version()
			})

			await Doc.create({ id: 'existing', title: 'Original', content: 'Content' })

			const result = await Doc.upsert({
				where: { id: 'existing' },
				create: { id: 'existing', title: 'New', content: 'New Content' },
				update: { title: 'Updated' }
			})

			expect(result._version).toBe(1)
		})
	})

	describe('Version Persistence', () => {
		it('should persist version across find operations', async () => {
			const Doc = FlashcoreSystem.registerModel<Document>('Doc', {
				id: f.id(),
				title: f.string(),
				content: f.string(),
				_version: f.number().version()
			})

			await Doc.create({ id: 'persist-test', title: 'Test', content: 'Content' })
			await Doc.update({ where: { id: 'persist-test' }, data: { title: 'Updated' } })
			await Doc.update({ where: { id: 'persist-test' }, data: { title: 'Updated Again' } })

			const found = await Doc.findUnique({ where: { id: 'persist-test' } })
			expect(found?._version).toBe(2)

			const foundMany = await Doc.findMany()
			expect(foundMany[0]._version).toBe(2)

			const foundFirst = await Doc.findFirst()
			expect(foundFirst?._version).toBe(2)
		})
	})

	describe('Explicit Version Check on Update', () => {
		it('should succeed when version matches', async () => {
			const Doc = FlashcoreSystem.registerModel<Document>('Doc', {
				id: f.id(),
				title: f.string(),
				content: f.string(),
				_version: f.number().version()
			})

			await Doc.create({ id: 'version-check', title: 'Original', content: 'Content' })

			// Update with correct version (0)
			const updated = await Doc.update({
				where: { id: 'version-check' },
				data: { title: 'Updated' },
				version: 0
			})

			expect(updated?._version).toBe(1)
			expect(updated?.title).toBe('Updated')
		})

		it('should fail when version does not match', async () => {
			const Doc = FlashcoreSystem.registerModel<Document>('Doc', {
				id: f.id(),
				title: f.string(),
				content: f.string(),
				_version: f.number().version()
			})

			await Doc.create({ id: 'version-mismatch', title: 'Original', content: 'Content' })

			// Try to update with wrong version
			await expect(Doc.update({
				where: { id: 'version-mismatch' },
				data: { title: 'Updated' },
				version: 5  // Wrong version, actual is 0
			})).rejects.toThrow('Version mismatch')
		})

		it('should detect concurrent modification', async () => {
			const Doc = FlashcoreSystem.registerModel<Document>('Doc', {
				id: f.id(),
				title: f.string(),
				content: f.string(),
				_version: f.number().version()
			})

			await Doc.create({ id: 'concurrent', title: 'Original', content: 'Content' })

			// Read the record (version 0)
			const record = await Doc.findUnique({ where: { id: 'concurrent' } })
			const originalVersion = record?._version ?? 0

			// Simulate concurrent modification
			await Doc.update({
				where: { id: 'concurrent' },
				data: { title: 'Modified by another process' }
			})

			// Try to update with stale version
			await expect(Doc.update({
				where: { id: 'concurrent' },
				data: { title: 'My update' },
				version: originalVersion
			})).rejects.toThrow('Version mismatch')
		})
	})

	describe('Version Overflow Protection', () => {
		it('should reset version to 1 on overflow', async () => {
			const Doc = FlashcoreSystem.registerModel<Document>('Doc', {
				id: f.id(),
				title: f.string(),
				content: f.string(),
				_version: f.number().version()
			})

			// Create with version near MAX_SAFE_INTEGER
			await Doc.create({
				id: 'overflow-test',
				title: 'Test',
				content: 'Content',
				_version: MAX_VERSION_VALUE - 1
			})

			// Update should trigger overflow and reset to 1
			const updated = await Doc.update({
				where: { id: 'overflow-test' },
				data: { title: 'Updated' }
			})

			expect(updated?._version).toBe(1)
		})

		it('should handle version at exact overflow boundary', async () => {
			const Doc = FlashcoreSystem.registerModel<Document>('Doc', {
				id: f.id(),
				title: f.string(),
				content: f.string(),
				_version: f.number().version()
			})

			// Create with version at MAX_SAFE_INTEGER - 1 (next increment would be MAX)
			await Doc.create({
				id: 'boundary-test',
				title: 'Test',
				content: 'Content',
				_version: MAX_VERSION_VALUE - 1
			})

			// Update should reset to 1
			const updated = await Doc.update({
				where: { id: 'boundary-test' },
				data: { title: 'Updated' }
			})

			expect(updated?._version).toBe(1)
		})
	})
})
