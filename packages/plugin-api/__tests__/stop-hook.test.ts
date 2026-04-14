import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const disposeRuntime = jest.fn()
const stopDevReload = jest.fn()
const engineStop = jest.fn(async () => undefined)

jest.unstable_mockModule('../src/core/api-runtime.js', () => ({
	getApiRuntime: jest.fn(() => ({
		dispose: disposeRuntime
	}))
}))

jest.unstable_mockModule('../src/core/dev-reload.js', () => ({
	stopDevReload
}))

jest.unstable_mockModule('../src/core/logger.js', () => ({
	logger: {
		debug: jest.fn(),
		error: jest.fn()
	}
}))

jest.unstable_mockModule('../src/robo/prepare.js', () => ({
	pluginOptions: {
		engine: {
			isRunning: () => true,
			stop: engineStop
		}
	}
}))

describe('@robojs/server stop hook', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		globalThis.roboServer = {
			ready: true,
			hmrCapabilities: { serverApiTopology: true },
			hmrTopologyState: { success: true },
			registeredPaths: ['/api/users']
		} as never
	})

	it('stops the engine before disposing runtime state', async () => {
		const order: string[] = []
		engineStop.mockImplementationOnce(async () => {
			order.push('engine')
		})
		stopDevReload.mockImplementationOnce(() => {
			order.push('reload')
		})
		disposeRuntime.mockImplementationOnce(() => {
			order.push('dispose')
		})

		const { default: stopHook } = await import('../src/robo/stop.js')
		await stopHook({ reason: 'restart' } as never)

		expect(order).toEqual(['engine', 'reload', 'dispose'])
		expect(globalThis.roboServer.ready).toBe(false)
		expect(globalThis.roboServer.hmrCapabilities).toBeUndefined()
		expect(globalThis.roboServer.hmrTopologyState).toBeUndefined()
		expect(globalThis.roboServer.registeredPaths).toEqual([])
	})
})
