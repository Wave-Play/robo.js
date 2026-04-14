import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { NodeEngine } from '../src/engines/node.js'

describe('NodeEngine route mutation', () => {
	afterEach(async () => {
		jest.clearAllMocks()
	})

	it('registers, replaces, and unregisters routes without rebuilding the server', async () => {
		const engine = new NodeEngine()
		await engine.init({})
		;(engine as any)._server?.unref?.()

		const firstHandler = jest.fn()
		const secondHandler = jest.fn()

		engine.registerRoute('/api/test', firstHandler)
		expect(engine.hasRoute('/api/test')).toBe(true)
		expect((engine as any)._router.find('/api/test')?.handler).toBe(firstHandler)

		engine.replaceRoute('/api/test', secondHandler)
		expect(engine.hasRoute('/api/test')).toBe(true)
		expect((engine as any)._router.find('/api/test')?.handler).toBe(secondHandler)

		engine.unregisterRoute('/api/test')
		expect(engine.hasRoute('/api/test')).toBe(false)
		expect((engine as any)._router.find('/api/test')).toBeNull()
	})

	it('throws when route removal fails for an existing path', async () => {
		const engine = new NodeEngine()
		await engine.init({})
		;(engine as any)._server?.unref?.()

		;(engine as any)._router = {
			hasRoute: () => true,
			removeRoute: () => false
		}

		expect(() => engine.unregisterRoute('/api/test')).toThrow('Failed to unregister route: /api/test')
	})

	it('throws when replacing a missing route', async () => {
		const engine = new NodeEngine()
		await engine.init({})
		;(engine as any)._server?.unref?.()

		expect(() => engine.replaceRoute('/api/missing', jest.fn())).toThrow('Cannot replace missing route: /api/missing')
	})
})
