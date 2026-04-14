import { beforeEach, describe, expect, it, jest } from '@jest/globals'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = jest.fn as any

const portal = {
	initialize: fn(async () => {}),
	registerNamespace: fn(),
	registerSingularName: fn(),
	ensureRoute: fn(async () => {}),
	getByType: fn(() => ({})),
	importHandler: fn(async () => {}),
	reloadRoute: fn(async () => {})
}

const Manifest = {
	routeDefinitions: fn()
}

const getConfig = fn()

const logger = {
	debug: fn(),
	error: fn()
}

jest.unstable_mockModule('../../src/core/portal-impl.js', () => ({
	portal
}))

jest.unstable_mockModule('../../src/core/manifest-api.js', () => ({
	Manifest
}))

jest.unstable_mockModule('../../src/core/config.js', () => ({
	getConfig
}))

jest.unstable_mockModule('../../src/core/logger.js', () => ({
	logger
}))

const { populatePortal, reloadPortalRoute } = await import('../../src/core/portal-loader.js')

describe('portal-loader', () => {
	beforeEach(() => {
		jest.clearAllMocks()
		Manifest.routeDefinitions.mockReturnValue({
			discordjs: {
				routes: {
					commands: { singular: 'command' }
				}
			}
		})
		getConfig.mockReturnValue({})
	})

	it('keeps lazy startup definition-only', async () => {
		await populatePortal('development')

		expect(portal.initialize).toHaveBeenCalledWith('development')
		expect(portal.registerNamespace).toHaveBeenCalledWith('discordjs', ['commands'])
		expect(portal.registerSingularName).toHaveBeenCalledWith('discordjs', 'commands', 'command')
		expect(portal.ensureRoute).not.toHaveBeenCalled()
		expect(portal.importHandler).not.toHaveBeenCalled()
	})

	it('still eagerly ensures routes and imports handlers when eager loading is enabled', async () => {
		getConfig.mockReturnValue({ portal: { loading: 'eager' } })
		portal.getByType.mockReturnValue({
			ping: { handler: null }
		})

		await populatePortal('development')

		expect(portal.ensureRoute).toHaveBeenCalledWith('discordjs', 'commands')
		expect(portal.importHandler).toHaveBeenCalledWith('discordjs', 'commands', 'ping')
	})

	it('reloads routes atomically through portal.reloadRoute', async () => {
		await reloadPortalRoute('discordjs', 'commands')

		expect(portal.reloadRoute).toHaveBeenCalledWith('discordjs', 'commands')
		expect(portal.ensureRoute).not.toHaveBeenCalled()
	})
})
