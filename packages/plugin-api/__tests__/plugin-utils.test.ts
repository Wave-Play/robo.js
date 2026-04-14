import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'

describe('plugin-utils', () => {
	beforeEach(() => {
		jest.useFakeTimers()
		jest.resetModules()
		jest.clearAllMocks()
		delete (globalThis as any).roboServer
	})

	afterEach(() => {
		jest.useRealTimers()
		delete (globalThis as any).roboServer
	})

	describe('_readyPromise', () => {
		it('resolves when globalThis.roboServer.ready becomes true', async () => {
			jest.unstable_mockModule('../src/robo/prepare.js', () => ({
				pluginOptions: {}
			}))

			const mod = await import('../src/core/plugin-utils.js')
			let resolved = false
			const promise = mod._readyPromise.then(() => {
				resolved = true
			})

			// Not yet ready
			expect(resolved).toBe(false)

			// Set ready flag
			;(globalThis as any).roboServer = { ready: true }

			// Advance past the 400ms polling interval
			jest.advanceTimersByTime(400)

			await promise
			expect(resolved).toBe(true)
		})

		it('uses 400ms polling interval', async () => {
			jest.unstable_mockModule('../src/robo/prepare.js', () => ({
				pluginOptions: {}
			}))

			const mod = await import('../src/core/plugin-utils.js')
			let resolved = false
			mod._readyPromise.then(() => {
				resolved = true
			})

			;(globalThis as any).roboServer = { ready: true }

			// At 300ms it should not have resolved yet
			jest.advanceTimersByTime(300)
			// Use a microtask flush to check
			await Promise.resolve()
			expect(resolved).toBe(false)

			// At 400ms it should resolve
			jest.advanceTimersByTime(100)
			await Promise.resolve()
			// Need another tick for the then callback
			await Promise.resolve()
			expect(resolved).toBe(true)
		})
	})

	describe('getServerEngine()', () => {
		it('returns engine from pluginOptions when available', async () => {
			const fakeEngine = { type: 'plugin-engine' }

			jest.unstable_mockModule('../src/robo/prepare.js', () => ({
				pluginOptions: { engine: fakeEngine }
			}))

			const mod = await import('../src/core/plugin-utils.js')
			expect(mod.getServerEngine()).toBe(fakeEngine)
		})

		it('falls back to globalThis.roboServer.engine', async () => {
			jest.unstable_mockModule('../src/robo/prepare.js', () => ({
				pluginOptions: {}
			}))

			const fakeEngine = { type: 'global-engine' }
			;(globalThis as any).roboServer = { engine: fakeEngine }

			const mod = await import('../src/core/plugin-utils.js')
			expect(mod.getServerEngine()).toBe(fakeEngine)
		})
	})
})
