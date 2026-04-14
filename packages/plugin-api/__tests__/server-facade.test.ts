import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals'

jest.unstable_mockModule('../src/core/plugin-utils.js', () => ({
	_readyPromise: Promise.resolve()
}))

jest.unstable_mockModule('robo.js', () => ({
	getPluginOptions: jest.fn(() => ({ port: 3000 }))
}))

describe('Server facade', () => {
	let Server: typeof import('../src/core/server.js').Server
	let setConfig: typeof import('../src/core/server.js').setConfig
	let setEngine: typeof import('../src/core/server.js').setEngine
	let getPluginOptions: jest.Mock

	beforeEach(async () => {
		jest.clearAllMocks()
		// Clean up globalThis.roboServer before each test
		delete (globalThis as any).roboServer

		const mod = await import('../src/core/server.js')
		Server = mod.Server
		setConfig = mod.setConfig
		setEngine = mod.setEngine

		const roboMod = await import('robo.js')
		getPluginOptions = roboMod.getPluginOptions as jest.Mock
	})

	afterEach(() => {
		delete (globalThis as any).roboServer
	})

	describe('Server.config()', () => {
		it('returns config from setConfig() when it has been called', () => {
			const config = { port: 8080, prefix: '/v1' }
			setConfig(config as never)

			expect(Server.config()).toBe(config)
		})

		it('falls back to getPluginOptions when setConfig has not been called', async () => {
			// Re-import to get a fresh module without prior setConfig call
			jest.resetModules()

			jest.unstable_mockModule('../src/core/plugin-utils.js', () => ({
				_readyPromise: Promise.resolve()
			}))

			const mockGetPluginOptions = jest.fn(() => ({ port: 3000 }))
			jest.unstable_mockModule('robo.js', () => ({
				getPluginOptions: mockGetPluginOptions
			}))

			const freshMod = await import('../src/core/server.js')

			const result = freshMod.Server.config()
			expect(mockGetPluginOptions).toHaveBeenCalledWith('@robojs/server')
			expect(result).toEqual({ port: 3000 })
		})
	})

	describe('Server.get()', () => {
		it('returns engine from globalThis.roboServer.engine', () => {
			const fakeEngine = { isRunning: () => true }
			;(globalThis as any).roboServer = { engine: fakeEngine }

			expect(Server.get()).toBe(fakeEngine)
		})

		it('falls back to setEngine() value when globalThis.roboServer is not set', () => {
			const fakeEngine = { isRunning: () => false }
			setEngine(fakeEngine as never)

			expect(Server.get()).toBe(fakeEngine)
		})

		it('returns undefined when neither globalThis.roboServer nor setEngine is set', async () => {
			jest.resetModules()

			jest.unstable_mockModule('../src/core/plugin-utils.js', () => ({
				_readyPromise: Promise.resolve()
			}))

			jest.unstable_mockModule('robo.js', () => ({
				getPluginOptions: jest.fn(() => ({}))
			}))

			const freshMod = await import('../src/core/server.js')
			expect(freshMod.Server.get()).toBeUndefined()
		})
	})

	describe('Server.ready()', () => {
		it('returns the _readyPromise', async () => {
			const promise = Server.ready()

			expect(promise).toBeInstanceOf(Promise)
			await expect(promise).resolves.toBeUndefined()
		})
	})
})
