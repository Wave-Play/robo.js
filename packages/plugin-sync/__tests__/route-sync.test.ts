import { beforeEach, describe, expect, it, jest } from '@jest/globals'

const roboMock = (await import('robo.js')) as unknown as {
	Manifest: {
		routeSummaries: jest.Mock
		routeSummariesSync: jest.Mock
	}
	portal: {
		getHandler: jest.Mock
		ensureRoute: jest.Mock
		getByType: jest.Mock
	}
	setRouteSummaries: (namespace: string, route: string, summaries: Array<Record<string, unknown>>) => void
	clearRouteSummaries: () => void
	setPortalData: (type: string, data: Record<string, unknown>) => void
	clearPortalData: () => void
}

const { portal, setRouteSummaries, clearRouteSummaries, setPortalData, clearPortalData } = roboMock

describe('sync route lazy registration', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		clearRouteSummaries()
		clearPortalData()
	})

	it('lists sync keys from route summaries without loading the portal route', async () => {
		const { NamespaceController } = await import('../src/robo/routes/sync.js')

		setRouteSummaries('sync', 'sync', [{ key: 'game/[roomId]/position' }, { key: 'chat/_middleware' }])

		const controller = NamespaceController({} as never)
		expect(controller.list()).toEqual(['game/[roomId]/position', 'chat/_middleware'])
	})

	it('initializes sync handler and middleware registries from summaries only', async () => {
		const { initializeSyncHandlers } = await import('../src/robo/routes/sync.js')
		const handlers = await import('../src/server/handlers.js')

		setRouteSummaries('sync', 'sync', [
			{
				key: 'game/[roomId]/position',
				path: 'sync/game/[roomId]/position.js',
				exports: { named: ['validate', 'transform'] }
			},
			{
				key: 'game/_middleware',
				path: 'sync/game/_middleware.js',
				exports: { named: ['before'] }
			}
		])

		handlers.clearHandlers()
		await initializeSyncHandlers({} as never)

		expect(handlers.getHandlerCount()).toBe(1)
		expect(handlers.getMiddlewareCount()).toBe(1)
		expect(portal.getHandler).not.toHaveBeenCalled()
	})

	it('lazy-loads a sync handler module on first use', async () => {
		const { initializeSyncHandlers } = await import('../src/robo/routes/sync.js')
		const handlers = await import('../src/server/handlers.js')

		setRouteSummaries('sync', 'sync', [
			{
				key: 'game/[roomId]/position',
				path: 'sync/game/[roomId]/position.js',
				exports: { named: ['validate'] }
			}
		])

		;(portal.getHandler as jest.Mock).mockResolvedValue({ validate: () => true } as never)

		handlers.clearHandlers()
		await initializeSyncHandlers({} as never)

		const result = await handlers.processUpdate(
			'game.room-1.position',
			['game', 'room-1', 'position'],
			{ x: 1 },
			undefined,
			{ id: 'client-1' }
		)

		expect(portal.getHandler).toHaveBeenCalledWith('sync', 'sync', 'game/[roomId]/position')
		expect(result.accepted).toBe(true)
	})

	it('refreshes only targeted sync handlers from the live portal during HMR', async () => {
		const { refreshSyncHandlersFromPortal } = await import('../src/robo/routes/sync.js')
		const handlers = await import('../src/server/handlers.js')

		setPortalData('sync:sync', {
			'game/[roomId]/position': {
				key: 'game/[roomId]/position',
				path: 'sync/game/[roomId]/position.js',
				exports: { default: false, config: false, named: ['validate'] },
				metadata: {},
				handler: null
			},
			'game/_middleware': {
				key: 'game/_middleware',
				path: 'sync/game/_middleware.js',
				exports: { default: false, config: false, named: ['before'] },
				metadata: {},
				handler: null
			}
		})

		;(portal.getHandler as jest.Mock).mockImplementation(async (...args: unknown[]) => {
			const [, , key] = args as [string, string, string]
			if (key === 'game/[roomId]/position') {
				return { validate: () => true, move: () => true }
			}

			return { before: async () => ({ continue: true }) }
		})

		handlers.clearHandlers()
		await refreshSyncHandlersFromPortal(portal as never, ['game/[roomId]/position'])

		expect(portal.ensureRoute).toHaveBeenCalledWith('sync', 'sync')
		expect(handlers.getHandlerCount()).toBe(1)
		expect(handlers.getMiddlewareCount()).toBe(0)
		expect(portal.getHandler).toHaveBeenCalledTimes(1)
		expect(portal.getHandler).toHaveBeenCalledWith('sync', 'sync', 'game/[roomId]/position')
	})
})
