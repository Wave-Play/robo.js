import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const markRoutesStale = jest.fn()
const syncTopology = jest.fn(async () => undefined)
const getRegisteredPaths = jest.fn(() => ['/api/health'])

jest.unstable_mockModule('../src/core/api-runtime.js', () => ({
	getApiRuntime: jest.fn(() => ({
		markRoutesStale,
		syncTopology,
		getRegisteredPaths
	}))
}))

jest.unstable_mockModule('../src/core/logger.js', () => ({
	logger: {
		debug: jest.fn(),
		warn: jest.fn()
	}
}))

describe('@robojs/server hmr hook', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		globalThis.roboServer = { registeredPaths: [] } as never
	})

	it('marks changed API routes stale without syncing topology', async () => {
		const { default: hmrHook } = await import('../src/robo/hmr.js')

		await hmrHook({
			changeType: 'change',
			routes: [
				{
					namespace: 'server',
					route: 'api',
					handlers: [{ key: 'users/[id]', path: 'api/users/[id].js', changeType: 'change' }]
				}
			]
		} as never)

		expect(markRoutesStale).toHaveBeenCalledWith(['users/[id]'])
		expect(syncTopology).not.toHaveBeenCalled()
	})

	it('syncs topology and updates registered paths for add/remove events', async () => {
		const { default: hmrHook } = await import('../src/robo/hmr.js')

		await hmrHook({
			changeType: 'add',
			routes: [
				{
					namespace: 'server',
					route: 'api',
					handlers: [{ key: 'health', path: 'api/health.js', changeType: 'add' }]
				}
			]
		} as never)

		expect(syncTopology).toHaveBeenCalled()
		expect(globalThis.roboServer.registeredPaths).toEqual(['/api/health'])
		expect(globalThis.roboServer.hmrTopologyState).toEqual({ success: true })
	})

	it('treats mixed add/remove batches as topology changes', async () => {
		const { default: hmrHook } = await import('../src/robo/hmr.js')

		await hmrHook({
			changeType: 'change',
			routes: [
				{
					namespace: 'server',
					route: 'api',
					handlers: [
						{ key: 'users', path: 'api/users.js', changeType: 'remove' },
						{ key: 'users/index', path: 'api/users/index.js', changeType: 'add' }
					]
				}
			]
		} as never)

		expect(syncTopology).toHaveBeenCalled()
		expect(markRoutesStale).not.toHaveBeenCalled()
	})

	it('invalidates changed handlers after a successful mixed topology sync', async () => {
		const { default: hmrHook } = await import('../src/robo/hmr.js')

		await hmrHook({
			changeType: 'change',
			routes: [
				{
					namespace: 'server',
					route: 'api',
					handlers: [
						{ key: 'users', path: 'api/users.js', changeType: 'change' },
						{ key: 'posts', path: 'api/posts.js', changeType: 'add' }
					]
				}
			]
		} as never)

		expect(syncTopology).toHaveBeenCalled()
		expect(markRoutesStale).toHaveBeenCalledWith(['users'])
	})

	it('reports topology sync failures', async () => {
		const error = new Error('sync failed') as Error & { rollbackAttempted?: boolean; rollbackFailed?: boolean }
		error.rollbackAttempted = true
		error.rollbackFailed = false
		syncTopology.mockRejectedValueOnce(error)
		const { default: hmrHook } = await import('../src/robo/hmr.js')

		await hmrHook({
			changeType: 'remove',
			routes: [
				{
					namespace: 'server',
					route: 'api',
					handlers: [{ key: 'users', path: 'api/users.js', changeType: 'remove' }]
				}
			]
		} as never)

		expect(globalThis.roboServer.hmrTopologyState).toEqual({
			success: false,
			error: 'sync failed',
			rollbackAttempted: true,
			rollbackFailed: false
		})
	})

	it('reports rollback failures in topology sync state', async () => {
		const error = new Error('Topology sync failed: apply failed. Rollback failed: rollback failed') as Error & {
			rollbackAttempted?: boolean
			rollbackFailed?: boolean
		}
		error.rollbackAttempted = true
		error.rollbackFailed = true
		syncTopology.mockRejectedValueOnce(error)
		const { default: hmrHook } = await import('../src/robo/hmr.js')

		await hmrHook({
			changeType: 'remove',
			routes: [
				{
					namespace: 'server',
					route: 'api',
					handlers: [{ key: 'users', path: 'api/users.js', changeType: 'remove' }]
				}
			]
		} as never)

		expect(globalThis.roboServer.hmrTopologyState).toEqual({
			success: false,
			error: 'Topology sync failed: apply failed. Rollback failed: rollback failed',
			rollbackAttempted: true,
			rollbackFailed: true
		})
	})
})
