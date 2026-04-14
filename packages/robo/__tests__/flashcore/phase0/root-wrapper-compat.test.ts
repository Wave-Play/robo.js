import { Flashcore } from '../../../src/core/flashcore.js'
import { FlashcoreSystem } from '../../../src/flashcore/core/system.js'
import { MemoryAdapter } from '../helpers/memory-adapter.js'

describe('Root Flashcore compatibility wrapper', () => {
	afterEach(async () => {
		await FlashcoreSystem._reset()
	})

	it('routes Flashcore.$.init() through legacy-compatible settings', async () => {
		await Flashcore.$.init({ adapter: new MemoryAdapter(), namespaceSeparator: '::' })

		expect(Flashcore.$.isInitialized).toBe(true)
		expect(Flashcore.$.config.namespaceSeparator).toBe('::')
		expect(Flashcore.$.config.kvReadPreference).toBe('legacy')
		expect(Flashcore.$.config.kvWriteMode).toBe('dual')
	})
})
