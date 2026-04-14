import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const initializeRuntime = jest.fn(async () => undefined)
const getRegisteredPaths = jest.fn(() => ['/api/users/:id'])
const getCapabilities = jest.fn(() => ({
	serverApiTopology: true,
	serverApiMutableRoutes: true
}))
const startEngine = jest.fn(async () => undefined)
const updateWatch = jest.fn(async () => undefined)
const ensureRoute = jest.fn(async () => undefined)
const importHandler = jest.fn(async () => undefined)
const routeSummariesSync = jest.fn(() => [{ key: 'users/[id]' }])

jest.unstable_mockModule('../src/core/logger.js', () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn()
	}
}))

jest.unstable_mockModule('../src/core/plugin-routes.js', () => ({
	getPluginRouteRegistry: jest.fn(() => ({
		getPlugin: jest.fn(() => null)
	}))
}))

jest.unstable_mockModule('../src/core/port-utils.js', () => ({
	DEFAULT_MAX_PORT_ATTEMPTS: 10,
	findAvailablePort: jest.fn(async ({ port }) => ({ port }))
}))

jest.unstable_mockModule('../src/robo/prepare.js', () => ({
	pluginOptions: {
		engine: {
			supportsRouteMutation: () => true,
			start: startEngine
		},
		prefix: '/api'
	}
}))

jest.unstable_mockModule('../src/core/api-runtime.js', () => ({
	getApiRuntime: jest.fn(() => ({
		initialize: initializeRuntime,
		getRegisteredPaths,
		getCapabilities
	}))
}))

jest.unstable_mockModule('robo.js', () => ({
	Manifest: {
		routeSummariesSync
	},
	Mode: {
		isDev: () => true,
		get: () => 'development'
	},
	getConfig: jest.fn(() => ({})),
	portal: {
		ensureRoute,
		importHandler,
		getByType: jest.fn(),
		getRecord: jest.fn()
	},
	Robo: {
		status: {
			set: jest.fn()
		}
	},
	color: {
		bold: (value: string) => value
	}
}))

jest.unstable_mockModule('robo.js/ipc', () => ({
	emit: jest.fn(),
	isCapable: jest.fn(() => false)
}))

jest.unstable_mockModule('robo.js/unstable.js', () => ({
	Nanocore: {
		update: updateWatch
	}
}))

describe('plugin-api lazy dev startup', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		globalThis.roboServer = { ready: false } as never
	})

	it('registers API routes from summaries without materializing the portal route', async () => {
		const { default: startHook } = await import('../src/robo/start.js')

		await startHook({} as never)

		expect(initializeRuntime).toHaveBeenCalled()
		expect(ensureRoute).not.toHaveBeenCalled()
		expect(importHandler).not.toHaveBeenCalled()
		expect(getRegisteredPaths).toHaveBeenCalled()
		expect(startEngine).toHaveBeenCalled()
		expect(updateWatch).toHaveBeenCalled()
		expect(globalThis.roboServer.hmrCapabilities).toEqual({
			serverApiTopology: true,
			serverApiMutableRoutes: true
		})
	})

	it('lists API routes from summaries in lazy mode', async () => {
		const { NamespaceController } = await import('../src/robo/routes/api.js')

		const controller = NamespaceController({} as never)
		expect(controller.list()).toEqual(['users/[id]'])
		expect(routeSummariesSync).toHaveBeenCalledWith('server', 'api')
	})
})
