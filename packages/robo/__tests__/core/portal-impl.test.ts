import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fn = jest.fn as any

const Manifest = {
	load: fn(),
	reload: fn(),
	reloadRouteSummaries: fn(),
	routeDefinitions: fn(),
	plugins: fn()
}

jest.unstable_mockModule('../../src/core/manifest-api.js', () => ({
	Manifest
}))

const { PortalImpl } = await import('../../src/core/portal-impl.js')
const { RoboPaths } = await import('../../src/core/paths.js')

describe('PortalImpl lazy routes', () => {
	let tempDir: string

	beforeEach(async () => {
		jest.clearAllMocks()
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'robo-portal-'))
		RoboPaths.configure({ baseDir: tempDir, customBuildDir: undefined })
		Manifest.plugins.mockReturnValue([])
		Manifest.reload.mockResolvedValue([])
		Manifest.reloadRouteSummaries.mockResolvedValue([])
	})

	afterEach(async () => {
		RoboPaths.configure({ baseDir: process.cwd(), customBuildDir: undefined })
		await fs.rm(tempDir, { recursive: true, force: true })
	})

	it('deduplicates concurrent route loads and registers controllers lazily', async () => {
		const controllerDir = path.join(tempDir, 'controllers')
		await fs.mkdir(controllerDir, { recursive: true })
		await fs.writeFile(
			path.join(controllerDir, 'discord-controller.js'),
			'exports.createController = function createController(key, record) { return { key, enabled: record.enabled } }\n'
		)

		Manifest.routeDefinitions.mockReturnValue({
			discordjs: {
				routes: {
					commands: {
						controller: {
							factory: './controllers/discord-controller.js#createController'
						}
					}
				}
			}
		})
		Manifest.plugins.mockReturnValue([
			{
				name: '@robojs/discordjs',
				namespace: 'discordjs',
				path: tempDir
			}
		])
		Manifest.load.mockResolvedValue([
			{
				key: 'ping',
				path: 'commands/ping.js',
				metadata: {}
			}
		])

		const portal = new PortalImpl()
		await portal.initialize('development')
		await Promise.all([
			portal.ensureRoute('discordjs', 'commands'),
			portal.ensureRoute('discordjs', 'commands')
		])

		expect(Manifest.load).toHaveBeenCalledTimes(1)
		expect(portal.getByType('discordjs:commands')).toEqual({
			ping: expect.objectContaining({ key: 'ping' })
		})
		expect(portal.getController<{ key: string }>('discordjs', 'commands', 'ping')).toEqual({
			key: 'ping',
			enabled: true
		})
	})

	it('auto-loads an unloaded route before importing a handler', async () => {
		const buildDir = path.join(tempDir, '.robo', 'build', 'development', 'commands')
		await fs.mkdir(buildDir, { recursive: true })
		await fs.writeFile(path.join(buildDir, 'ping.js'), "module.exports = 'pong'\n")

		Manifest.routeDefinitions.mockReturnValue({
			discordjs: {
				routes: {
					commands: {}
				}
			}
		})
		Manifest.load.mockResolvedValue([
			{
				key: 'ping',
				path: 'commands/ping.js',
				metadata: {}
			}
		])

		const portal = new PortalImpl()
		await portal.initialize('development')
		await portal.importHandler('discordjs', 'commands', 'ping')

		expect(Manifest.load).toHaveBeenCalledTimes(1)
		expect(portal.getRecord('discordjs', 'commands', 'ping')?.handler?.default).toBe('pong')
	})

	it('replaces route state during reload without leaving the route empty', async () => {
		Manifest.routeDefinitions.mockReturnValue({
			discordjs: {
				routes: {
					commands: {}
				}
			}
		})
		Manifest.load
			.mockResolvedValueOnce([
				{
					key: 'ping',
					path: 'commands/ping.js',
					metadata: {}
				}
			])
			.mockResolvedValueOnce([
				{
					key: 'pong',
					path: 'commands/pong.js',
					metadata: {}
				}
			])

		const portal = new PortalImpl()
		await portal.initialize('development')
		await portal.ensureRoute('discordjs', 'commands')

		expect(Object.keys(portal.getByType('discordjs:commands'))).toEqual(['ping'])

		await portal.reloadRoute('discordjs', 'commands')

		expect(Manifest.reload).toHaveBeenCalledWith('discordjs', 'commands')
		expect(Manifest.reloadRouteSummaries).toHaveBeenCalledWith('discordjs', 'commands')
		expect(Object.keys(portal.getByType('discordjs:commands'))).toEqual(['pong'])
	})

	it('preserves the previous route when atomic reload fails', async () => {
		Manifest.routeDefinitions
			.mockReturnValueOnce({
				discordjs: {
					routes: {
						commands: {}
					}
				}
			})
			.mockReturnValueOnce({
				discordjs: {
					routes: {
						commands: {
							controller: {
								factory: './controllers/missing.js#createController'
							}
						}
					}
				}
			})
		Manifest.load
			.mockResolvedValueOnce([
				{
					key: 'ping',
					path: 'commands/ping.js',
					metadata: {}
				}
			])
			.mockResolvedValueOnce([
				{
					key: 'pong',
					path: 'commands/pong.js',
					metadata: {}
				}
			])

		const portal = new PortalImpl()
		await portal.initialize('development')
		await portal.ensureRoute('discordjs', 'commands')

		await expect(portal.reloadRoute('discordjs', 'commands')).rejects.toThrow()

		expect(Object.keys(portal.getByType('discordjs:commands'))).toEqual(['ping'])
		expect(portal.getRecord('discordjs', 'commands', 'ping')).toBeDefined()
		expect(portal.getRecord('discordjs', 'commands', 'pong')).toBeUndefined()
	})

	it('preserves the previous route when a configured controller factory is invalid', async () => {
		const controllerDir = path.join(tempDir, 'controllers')
		await fs.mkdir(controllerDir, { recursive: true })
		await fs.writeFile(path.join(controllerDir, 'invalid-controller.js'), 'exports.notAFactory = 123\n')
		Manifest.plugins.mockReturnValue([
			{
				name: '@robojs/discordjs',
				namespace: 'discordjs',
				path: tempDir
			}
		])

		Manifest.routeDefinitions
			.mockReturnValueOnce({
				discordjs: {
					routes: {
						commands: {}
					}
				}
			})
			.mockReturnValueOnce({
				discordjs: {
					routes: {
						commands: {
							controller: {
								factory: './controllers/invalid-controller.js#createController'
							}
						}
					}
				}
			})
		Manifest.load
			.mockResolvedValueOnce([
				{
					key: 'ping',
					path: 'commands/ping.js',
					metadata: {}
				}
			])
			.mockResolvedValueOnce([
				{
					key: 'pong',
					path: 'commands/pong.js',
					metadata: {}
				}
			])

		const portal = new PortalImpl()
		await portal.initialize('development')
		await portal.ensureRoute('discordjs', 'commands')

		await expect(portal.reloadRoute('discordjs', 'commands')).rejects.toThrow(
			'Controller factory could not be resolved for discordjs.commands'
		)

		expect(Object.keys(portal.getByType('discordjs:commands'))).toEqual(['ping'])
		expect(portal.getRecord('discordjs', 'commands', 'ping')).toBeDefined()
		expect(portal.getRecord('discordjs', 'commands', 'pong')).toBeUndefined()
	})
})
