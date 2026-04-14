/**
 * Phase 6: Preload Tests
 *
 * Tests for $.preload() functionality.
 */

import { FlashcoreSystem } from '../../../src/flashcore/core/system.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'
import { f } from '../../../src/flashcore/schema/field.js'

describe('FlashcoreSystem.preload()', () => {
	let adapter: MemoryAdapter

	beforeEach(async () => {
		await FlashcoreSystem._reset()
		adapter = new MemoryAdapter()
	})

	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('should preload specified models', async () => {
		await FlashcoreSystem.init({
			adapter,
			lazyLoading: true
		})

		// Register models
		FlashcoreSystem.registerModel<{ id: string; name: string }>('Model1', { id: f.id(), name: f.string() })
		FlashcoreSystem.registerModel<{ id: string; name: string }>('Model2', { id: f.id(), name: f.string() })
		FlashcoreSystem.registerModel<{ id: string; name: string }>('Model3', { id: f.id(), name: f.string() })

		// Preload only Model1 and Model2
		await FlashcoreSystem.preload(['Model1', 'Model2'])

		// Should complete without error
	})

	it('should handle preloading already-loaded models', async () => {
		await FlashcoreSystem.init({ adapter })

		const TestModel = FlashcoreSystem.registerModel<{ id: string; name: string }>('TestModel', {
			id: f.id(),
			name: f.string()
		})

		// Create a record (forces index loading)
		await TestModel.create({ name: 'Test' })

		// Preload should be a no-op for already-loaded models
		await FlashcoreSystem.preload(['TestModel'])
	})

	it('should warn for non-existent models', async () => {
		await FlashcoreSystem.init({ adapter })

		FlashcoreSystem.registerModel<{ id: string; name: string }>('ExistingModel', { id: f.id(), name: f.string() })

		// Should not throw, but may warn
		await FlashcoreSystem.preload(['ExistingModel', 'NonExistentModel'])
	})

	it('should throw if not initialized', async () => {
		await expect(FlashcoreSystem.preload(['SomeModel'])).rejects.toThrow(/not initialized/i)
	})

	it('should handle empty array', async () => {
		await FlashcoreSystem.init({ adapter })

		await expect(FlashcoreSystem.preload([])).resolves.not.toThrow()
	})

	it('should preload namespaced models', async () => {
		await FlashcoreSystem.init({
			adapter,
			lazyLoading: true
		})

		// Register namespaced model
		const schema = FlashcoreSystem.schema('plugin1')
		schema.model<{ id: string; data: string }>('PluginModel', { id: f.id(), data: f.string() })

		// Preload using full key
		await FlashcoreSystem.preload(['plugin1::PluginModel'])
	})
})
