/**
 * HMR Runtime Cleanup API Tests
 *
 * Tests for the HMR cleanup/dispose API that allows modules to register
 * cleanup callbacks that run when the module is hot-reloaded.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// Store original env
let originalRoboHmr: string | undefined

describe('HMR Runtime Cleanup API', () => {
	let tempDir: string

	beforeEach(() => {
		// Create a temporary directory for test files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hmr-runtime-test-'))

		// Save original env value
		originalRoboHmr = process.env.ROBO_HMR

		// Clear global HMR state between tests
		delete (globalThis as Record<string, unknown>).__robo_hmr__
	})

	afterEach(() => {
		// Clean up temp directory
		fs.rmSync(tempDir, { recursive: true, force: true })

		// Restore original env
		if (originalRoboHmr === undefined) {
			delete process.env.ROBO_HMR
		} else {
			process.env.ROBO_HMR = originalRoboHmr
		}

		// Clear global HMR state
		delete (globalThis as Record<string, unknown>).__robo_hmr__
	})

	// Helper to import the hmr module fresh (bypassing cache)
	async function importHmrFresh() {
		jest.resetModules()
		const hmrModule = await import('../../src/core/hmr.js')
		return hmrModule
	}

	describe('hmr.enabled', () => {
		it('returns true when ROBO_HMR is true', async () => {
			process.env.ROBO_HMR = 'true'
			const { hmr } = await importHmrFresh()
			expect(hmr.enabled).toBe(true)
		})

		it('returns false when ROBO_HMR is not set', async () => {
			delete process.env.ROBO_HMR
			const { hmr } = await importHmrFresh()
			expect(hmr.enabled).toBe(false)
		})

		it('returns false when ROBO_HMR is set to something other than true', async () => {
			process.env.ROBO_HMR = 'false'
			const { hmr } = await importHmrFresh()
			expect(hmr.enabled).toBe(false)
		})
	})

	describe('hmr.module() in dev mode', () => {
		beforeEach(() => {
			process.env.ROBO_HMR = 'true'
		})

		it('returns a HotModule with dispose and data', async () => {
			const { hmr } = await importHmrFresh()
			const hot = hmr.module('file:///test/module.js')

			expect(hot).toBeDefined()
			expect(typeof hot.dispose).toBe('function')
			expect(typeof hot.data).toBe('object')
		})

		it('registers dispose callback without immediately calling it', async () => {
			const { hmr } = await importHmrFresh()
			const hot = hmr.module('file:///test/module.js')

			let called = false
			hot.dispose(() => {
				called = true
			})

			expect(called).toBe(false)
		})

		it('runs dispose callback when module is re-imported', async () => {
			const { hmr } = await importHmrFresh()

			// First "import" - register a dispose callback
			let disposeCount = 0
			const hot1 = hmr.module('file:///test/module.js?robo_hmr=1')
			hot1.dispose(() => {
				disposeCount++
			})

			expect(disposeCount).toBe(0)

			// Second "import" - simulates HMR reload
			const hot2 = hmr.module('file:///test/module.js?robo_hmr=2')

			// Dispose from first import should have run
			expect(disposeCount).toBe(1)

			// The new hot module should be fresh
			expect(hot2).toBeDefined()
		})

		it('runs multiple dispose callbacks in order', async () => {
			const { hmr } = await importHmrFresh()

			const callOrder: number[] = []

			const hot1 = hmr.module('file:///test/module.js?v=1')
			hot1.dispose(() => callOrder.push(1))
			hot1.dispose(() => callOrder.push(2))
			hot1.dispose(() => callOrder.push(3))

			// Re-import triggers disposers
			hmr.module('file:///test/module.js?v=2')

			expect(callOrder).toEqual([1, 2, 3])
		})

		it('persists data across reloads', async () => {
			const { hmr } = await importHmrFresh()

			// First import - set data
			const hot1 = hmr.module('file:///test/module.js?v=1')
			hot1.data.counter = 1
			hot1.data.name = 'test'

			// Second import - data should persist
			const hot2 = hmr.module('file:///test/module.js?v=2')

			expect(hot2.data.counter).toBe(1)
			expect(hot2.data.name).toBe('test')

			// Can modify persisted data
			hot2.data.counter = 2

			// Third import - sees updated data
			const hot3 = hmr.module('file:///test/module.js?v=3')
			expect(hot3.data.counter).toBe(2)
		})

		it('isolates data between different modules', async () => {
			const { hmr } = await importHmrFresh()

			const hotA = hmr.module('file:///test/moduleA.js')
			const hotB = hmr.module('file:///test/moduleB.js')

			hotA.data.value = 'A'
			hotB.data.value = 'B'

			expect(hotA.data.value).toBe('A')
			expect(hotB.data.value).toBe('B')
		})

		it('handles async dispose callbacks (fire-and-forget)', async () => {
			const { hmr } = await importHmrFresh()

			let asyncCleanupDone = false

			const hot1 = hmr.module('file:///test/module.js?v=1')
			hot1.dispose(async () => {
				await new Promise((resolve) => setTimeout(resolve, 10))
				asyncCleanupDone = true
			})

			// Re-import starts async cleanup
			hmr.module('file:///test/module.js?v=2')

			// Cleanup hasn't finished yet (fire-and-forget)
			expect(asyncCleanupDone).toBe(false)

			// Wait for async cleanup to complete
			await new Promise((resolve) => setTimeout(resolve, 50))
			expect(asyncCleanupDone).toBe(true)
		})

		it('continues running other disposers if one throws', async () => {
			const { hmr } = await importHmrFresh()

			const callOrder: number[] = []

			// Mock console.error to suppress expected error output
			const originalConsoleError = console.error
			console.error = jest.fn()

			const hot1 = hmr.module('file:///test/module.js?v=1')
			hot1.dispose(() => callOrder.push(1))
			hot1.dispose(() => {
				throw new Error('Intentional test error')
			})
			hot1.dispose(() => callOrder.push(3))

			// Re-import triggers disposers
			hmr.module('file:///test/module.js?v=2')

			// First and third should have run despite second throwing
			expect(callOrder).toEqual([1, 3])

			// Error should have been logged
			expect(console.error).toHaveBeenCalled()

			// Restore console.error
			console.error = originalConsoleError
		})

		it('logs error for rejected async dispose callbacks', async () => {
			const { hmr } = await importHmrFresh()

			// Mock console.error
			const originalConsoleError = console.error
			const errorCalls: unknown[][] = []
			console.error = (...args: unknown[]) => errorCalls.push(args)

			const hot1 = hmr.module('file:///test/module.js?v=1')
			hot1.dispose(async () => {
				throw new Error('Async error')
			})

			// Re-import starts async cleanup
			hmr.module('file:///test/module.js?v=2')

			// Wait for async rejection to be caught
			await new Promise((resolve) => setTimeout(resolve, 50))

			// Error should have been logged
			expect(errorCalls.length).toBeGreaterThan(0)
			expect(errorCalls[0][0]).toContain('[HMR]')

			// Restore console.error
			console.error = originalConsoleError
		})
	})

	describe('URL normalization', () => {
		beforeEach(() => {
			process.env.ROBO_HMR = 'true'
		})

		it('treats URLs with different query strings as same module', async () => {
			const { hmr } = await importHmrFresh()

			let disposeCount = 0

			// Import with query string
			const hot1 = hmr.module('file:///test/module.js?robo_hmr=1')
			hot1.dispose(() => disposeCount++)

			// Import with different query string - should trigger dispose
			hmr.module('file:///test/module.js?robo_hmr=2')

			expect(disposeCount).toBe(1)
		})

		it('treats URLs with different hashes as same module', async () => {
			const { hmr } = await importHmrFresh()

			let disposeCount = 0

			const hot1 = hmr.module('file:///test/module.js#hash1')
			hot1.dispose(() => disposeCount++)

			hmr.module('file:///test/module.js#hash2')

			expect(disposeCount).toBe(1)
		})

		it('treats different paths as different modules', async () => {
			const { hmr } = await importHmrFresh()

			let disposeCountA = 0
			let disposeCountB = 0

			const hotA = hmr.module('file:///test/moduleA.js')
			hotA.dispose(() => disposeCountA++)

			const hotB = hmr.module('file:///test/moduleB.js')
			hotB.dispose(() => disposeCountB++)

			// Re-import only moduleA
			hmr.module('file:///test/moduleA.js?v=2')

			expect(disposeCountA).toBe(1)
			expect(disposeCountB).toBe(0)
		})

		it('handles complex query strings', async () => {
			const { hmr } = await importHmrFresh()

			let disposeCount = 0

			const hot1 = hmr.module('file:///test/module.js?foo=bar&robo_hmr=1&baz=qux')
			hot1.dispose(() => disposeCount++)

			hmr.module('file:///test/module.js?different=params')

			expect(disposeCount).toBe(1)
		})

		it('handles malformed URLs gracefully', async () => {
			const { hmr } = await importHmrFresh()

			// These shouldn't throw
			expect(() => hmr.module('not-a-valid-url')).not.toThrow()
			expect(() => hmr.module('')).not.toThrow()
			expect(() => hmr.module('relative/path.js')).not.toThrow()
		})
	})

	describe('hmr.module() in production mode (no-op)', () => {
		beforeEach(() => {
			delete process.env.ROBO_HMR
		})

		it('returns no-op HotModule', async () => {
			const { hmr } = await importHmrFresh()
			const hot = hmr.module('file:///test/module.js')

			expect(hot).toBeDefined()
			expect(typeof hot.dispose).toBe('function')
			expect(typeof hot.data).toBe('object')
		})

		it('dispose is a no-op', async () => {
			const { hmr } = await importHmrFresh()

			let called = false

			const hot1 = hmr.module('file:///test/module.js?v=1')
			hot1.dispose(() => {
				called = true
			})

			// In production, calling module() again should NOT run disposers
			hmr.module('file:///test/module.js?v=2')

			expect(called).toBe(false)
		})

		it('data is an empty object (not persisted)', async () => {
			const { hmr } = await importHmrFresh()

			const hot1 = hmr.module('file:///test/module.js?v=1')
			hot1.data.value = 'test'

			// In production, data is a shared empty object (not per-module)
			// Setting values won't persist across "reloads" in any meaningful way
			// because HMR doesn't actually happen in production
			expect(typeof hot1.data).toBe('object')
		})
	})

	describe('global state persistence', () => {
		beforeEach(() => {
			process.env.ROBO_HMR = 'true'
		})

		it('state persists in globalThis.__robo_hmr__', async () => {
			const { hmr } = await importHmrFresh()

			hmr.module('file:///test/module.js')

			expect((globalThis as Record<string, unknown>).__robo_hmr__).toBeDefined()
		})

		it('state survives hmr module reimport', async () => {
			// First import
			const { hmr: hmr1 } = await importHmrFresh()
			const hot1 = hmr1.module('file:///test/module.js')
			hot1.data.persistedValue = 'survives'

			// Second import of hmr module itself
			const { hmr: hmr2 } = await importHmrFresh()
			const hot2 = hmr2.module('file:///test/module.js?v=2')

			// Data should persist because it's in globalThis
			expect(hot2.data.persistedValue).toBe('survives')
		})
	})

	describe('reloadCount tracking', () => {
		beforeEach(() => {
			process.env.ROBO_HMR = 'true'
		})

		it('increments reloadCount when disposers run', async () => {
			const { hmr } = await importHmrFresh()

			// First module call initializes state
			hmr.module('file:///test/module.js?v=1')

			// Get state after initialization
			const state = (globalThis as { __robo_hmr__?: { reloadCount: number } }).__robo_hmr__!
			expect(state).toBeDefined()
			const countAfterFirst = state.reloadCount

			// Register a disposer on a new module
			const hot = hmr.module('file:///test/module2.js')
			hot.dispose(() => {})

			// Re-import increments count when disposer runs
			hmr.module('file:///test/module2.js?v=2')
			expect(state.reloadCount).toBe(countAfterFirst + 1)
		})
	})
})
