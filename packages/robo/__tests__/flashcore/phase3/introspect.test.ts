/**
 * Flashcore v1 (spec rev 4.3) Phase 3 - Introspection Tests
 *
 * Tests the Flashcore.$.introspect() API.
 */

// Uses Jest globals
import { FlashcoreSystem } from '../../../src/flashcore/core/system.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'
import { f } from '../../../src/flashcore/schema/field.js'

describe('Flashcore Introspection', () => {
	beforeEach(async () => {
		await FlashcoreSystem._reset()
	})

	describe('Not Initialized', () => {
		it('should throw when not initialized', async () => {
			await expect(FlashcoreSystem.introspect()).rejects.toThrow('not initialized')
		})
	})

	describe('Empty State', () => {
		beforeEach(async () => {
			await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
		})

		it('should return introspection data structure', async () => {
			const info = await FlashcoreSystem.introspect()

			expect(info).toHaveProperty('models')
			expect(info).toHaveProperty('kvNamespaces')
			expect(info).toHaveProperty('storage')
			expect(info).toHaveProperty('plugins')
			expect(info).toHaveProperty('walStatus')
		})

		it('should have empty models list initially', async () => {
			const info = await FlashcoreSystem.introspect()

			expect(info.models).toEqual([])
		})

		it('should have empty plugins list initially', async () => {
			const info = await FlashcoreSystem.introspect()

			expect(info.plugins).toEqual([])
		})

		it('should have zero pending WAL entries', async () => {
			const info = await FlashcoreSystem.introspect()

			expect(info.walStatus.pendingEntries).toBe(0)
			expect(info.walStatus.lastRecovery).toBeUndefined()
		})

		it('should report storage info', async () => {
			const info = await FlashcoreSystem.introspect()

			expect(info.storage).toHaveProperty('totalKeys')
			expect(info.storage.totalKeys).toBe(0)
		})
	})

	describe('Model Registration', () => {
		beforeEach(async () => {
			await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
		})

		it('should include registered model in introspection', async () => {
			FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const info = await FlashcoreSystem.introspect()

			expect(info.models).toHaveLength(1)
			expect(info.models[0].name).toBe('User')
		})

		it('should include model fields', async () => {
			FlashcoreSystem.registerModel<{ id: string; name: string; email: string; age: number }>(
				'User',
				{
					id: f.id(),
					name: f.string(),
					email: f.string().unique(),
					age: f.number().optional()
				}
			)

			const info = await FlashcoreSystem.introspect()

			expect(info.models[0].fields).toContain('name')
			expect(info.models[0].fields).toContain('email')
			expect(info.models[0].fields).toContain('age')
		})

		it('should include model namespace', async () => {
			FlashcoreSystem.registerModel<{ id: string; name: string }>(
				'Item',
				{ id: f.id(), name: f.string() },
				{ namespace: 'inventory' }
			)

			const info = await FlashcoreSystem.introspect()

			expect(info.models[0].namespace).toBe('inventory')
		})

		it('should include schema checksum', async () => {
			FlashcoreSystem.registerModel<{ id: string; title: string }>('Post', {
				id: f.id(),
				title: f.string()
			})

			const info = await FlashcoreSystem.introspect()

			expect(info.models[0].schemaChecksum).toBeDefined()
			expect(typeof info.models[0].schemaChecksum).toBe('string')
		})

		it('should include indexed fields', async () => {
			FlashcoreSystem.registerModel<{ id: string; email: string; username: string }>(
				'Account',
				{
					id: f.id(),
					email: f.string().indexed(),
					username: f.string().indexed()
				}
			)

			const info = await FlashcoreSystem.introspect()

			// Explicitly indexed fields appear in indexes list
			expect(info.models[0].indexes).toContain('email')
			expect(info.models[0].indexes).toContain('username')
		})

		it('should include relations', async () => {
			FlashcoreSystem.registerModel<{ id: string; authorId: string }>('Post', {
				id: f.id(),
				authorId: f.relation('User', 'authorId')
			})

			const info = await FlashcoreSystem.introspect()

			expect(info.models[0].relations).toContain('User')
		})

		it('should list multiple models', async () => {
			FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})
			FlashcoreSystem.registerModel<{ id: string; title: string }>('Post', {
				id: f.id(),
				title: f.string()
			})
			FlashcoreSystem.registerModel<{ id: string; body: string }>('Comment', {
				id: f.id(),
				body: f.string()
			})

			const info = await FlashcoreSystem.introspect()

			expect(info.models).toHaveLength(3)
			const names = info.models.map(m => m.name)
			expect(names).toContain('User')
			expect(names).toContain('Post')
			expect(names).toContain('Comment')
		})

		it('should reflect actual record counts', async () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			await User.create({ name: 'Alice' })
			await User.create({ name: 'Bob' })
			await User.create({ name: 'Charlie' })

			const info = await FlashcoreSystem.introspect()

			expect(info.models[0].recordCount).toBe(3)
			expect(info.storage.totalKeys).toBeGreaterThanOrEqual(3)
		})
	})

	describe('Plugin Registration', () => {
		it('should include registered plugins', async () => {
			const testPlugin = {
				name: 'test-plugin',
				version: '1.0.0',
				async setup() {}
			}

			await FlashcoreSystem.init({
				adapter: new MemoryAdapter(),
				plugins: [testPlugin]
			})

			const info = await FlashcoreSystem.introspect()

			expect(info.plugins).toContain('test-plugin')
		})

		it('should include multiple plugins', async () => {
			const plugin1 = { name: 'plugin-one', version: '1.0.0', async setup() {} }
			const plugin2 = { name: 'plugin-two', version: '2.0.0', async setup() {} }

			await FlashcoreSystem.init({
				adapter: new MemoryAdapter(),
				plugins: [plugin1, plugin2]
			})

			const info = await FlashcoreSystem.introspect()

			expect(info.plugins).toContain('plugin-one')
			expect(info.plugins).toContain('plugin-two')
		})
	})

	describe('WAL Status', () => {
		beforeEach(async () => {
			await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
		})

		it('should track pending entries', async () => {
			FlashcoreSystem._setWalPendingEntries(10)

			const info = await FlashcoreSystem.introspect()

			expect(info.walStatus.pendingEntries).toBe(10)
		})

		it('should update pending entries', async () => {
			FlashcoreSystem._setWalPendingEntries(5)
			FlashcoreSystem._setWalPendingEntries(3)

			const info = await FlashcoreSystem.introspect()

			expect(info.walStatus.pendingEntries).toBe(3)
		})

		it('should track last recovery', async () => {
			FlashcoreSystem._recordWalRecovery()

			const info = await FlashcoreSystem.introspect()

			expect(info.walStatus.lastRecovery).toBeInstanceOf(Date)

			// Should be very recent
			const now = Date.now()
			const recoveryTime = info.walStatus.lastRecovery!.getTime()
			expect(now - recoveryTime).toBeLessThan(1000)
		})
	})

	describe('Namespaced Schema', () => {
		beforeEach(async () => {
			await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
		})

		it('should provide schema helper for namespaced models', () => {
			const inventorySchema = FlashcoreSystem.schema('inventory')

			expect(inventorySchema.namespace).toBe('inventory')
		})

		it('should register models through schema helper', async () => {
			const schema = FlashcoreSystem.schema('shop')
			schema.model<{ id: string; name: string }>('Product', {
				id: f.id(),
				name: f.string()
			})

			const info = await FlashcoreSystem.introspect()

			expect(info.models).toHaveLength(1)
			expect(info.models[0].name).toBe('Product')
			expect(info.models[0].namespace).toBe('shop')
		})

		it('should support multiple namespaces', async () => {
			const userSchema = FlashcoreSystem.schema('users')
			const orderSchema = FlashcoreSystem.schema('orders')

			userSchema.model<{ id: string; name: string }>('Profile', {
				id: f.id(),
				name: f.string()
			})
			orderSchema.model<{ id: string; total: number }>('Invoice', {
				id: f.id(),
				total: f.number()
			})

			const info = await FlashcoreSystem.introspect()

			expect(info.models).toHaveLength(2)

			const profile = info.models.find(m => m.name === 'Profile')
			const invoice = info.models.find(m => m.name === 'Invoice')

			expect(profile?.namespace).toBe('users')
			expect(invoice?.namespace).toBe('orders')
		})
	})

	describe('Model Retrieval', () => {
		beforeEach(async () => {
			await FlashcoreSystem.init({ adapter: new MemoryAdapter() })
		})

		it('should retrieve registered model by name', () => {
			const User = FlashcoreSystem.registerModel<{ id: string; name: string }>('User', {
				id: f.id(),
				name: f.string()
			})

			const retrieved = FlashcoreSystem.getModel<{ id: string; name: string }>('User')

			expect(retrieved).toBe(User)
		})

		it('should return undefined for unregistered model', () => {
			const model = FlashcoreSystem.getModel('NonExistent')

			expect(model).toBeUndefined()
		})

		it('should retrieve namespaced model with full key', () => {
			FlashcoreSystem.registerModel<{ id: string; name: string }>(
				'Item',
				{ id: f.id(), name: f.string() },
				{ namespace: 'inventory' }
			)

			const model = FlashcoreSystem.getModel('inventory::Item')

			expect(model).toBeDefined()
			expect(model?.name).toBe('Item')
		})
	})
})
