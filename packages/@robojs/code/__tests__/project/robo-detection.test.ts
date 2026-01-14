/**
 * Unit tests for Robo.js project detection
 */

import { jest, describe, it, expect } from '@jest/globals'
import {
	detectRoboProject,
	buildRoboOverview,
	parsePackageJson,
	getRoboPackages,
	determineProjectKind,
	getRoboVersion,
	hasRoboConfig,
	type ParsedPackageJson
} from '../../src/project/robo-detection.js'
import type { ExecutionProvider } from '../../src/types/execution.js'
import type { DirEntry, FileStat } from '../../src/types/terminal.js'

/**
 * Create a mock provider for testing
 */
function createMockProvider(files: Record<string, string> = {}, dirs: string[] = []): ExecutionProvider {
	const mockProvider: ExecutionProvider = {
		readFile: jest.fn(async (path: string) => {
			if (files[path]) return files[path]
			throw new Error(`File not found: ${path}`)
		}),
		writeFile: jest.fn(async () => {}),
		deletePath: jest.fn(async () => {}),
		exists: jest.fn(async (path: string) => {
			return path in files || dirs.includes(path)
		}),
		readdir: jest.fn(async (path: string): Promise<DirEntry[]> => {
			const entries: DirEntry[] = []

			// Return files in this directory
			for (const filePath of Object.keys(files)) {
				if (filePath.startsWith(path + '/')) {
					const relativePath = filePath.slice(path.length + 1)
					const parts = relativePath.split('/')
					const name = parts[0]
					const isDir = parts.length > 1

					// Avoid duplicates
					if (!entries.find((e) => e.name === name)) {
						entries.push({
							name,
							path: path + '/' + name,
							isDirectory: isDir,
							isFile: !isDir
						})
					}
				}
			}

			return entries
		}),
		mkdir: jest.fn(async () => {}),
		stat: jest.fn(async (path: string): Promise<FileStat> => {
			if (dirs.includes(path)) {
				return { size: 0, isDirectory: true }
			}
			if (files[path]) {
				return { size: files[path].length, isDirectory: false }
			}
			throw new Error(`Not found: ${path}`)
		}),
		search: jest.fn(async () => []),
		snapshot: jest.fn(async () => ({})),
		run: jest.fn(async () => ({ exitCode: 0, output: '' })),
		runStream: jest.fn(async function* () {}),
		startSession: jest.fn(async () => ({ id: 'test' })),
		stopSession: jest.fn(async () => {}),
		streamSession: jest.fn(async function* () {})
	}

	return mockProvider
}

describe('parsePackageJson', () => {
	it('should parse valid package.json', () => {
		const content = JSON.stringify({
			name: 'my-bot',
			version: '1.0.0',
			dependencies: { 'robo.js': '^1.0.0' },
			devDependencies: { typescript: '^5.0.0' }
		})

		const result = parsePackageJson(content)
		expect(result).not.toBeNull()
		expect(result?.name).toBe('my-bot')
		expect(result?.version).toBe('1.0.0')
		expect(result?.dependencies?.['robo.js']).toBe('^1.0.0')
	})

	it('should return null for invalid JSON', () => {
		const result = parsePackageJson('not json')
		expect(result).toBeNull()
	})

	it('should handle missing fields', () => {
		const result = parsePackageJson('{}')
		expect(result).not.toBeNull()
		expect(result?.name).toBeUndefined()
	})
})

describe('getRoboPackages', () => {
	it('should find robo.js in dependencies', () => {
		const pkg: ParsedPackageJson = {
			dependencies: { 'robo.js': '^1.0.0' }
		}
		const packages = getRoboPackages(pkg)
		expect(packages).toContain('robo.js')
	})

	it('should find @robojs/* packages', () => {
		const pkg: ParsedPackageJson = {
			dependencies: {
				'@robojs/discordjs': '^1.0.0',
				'@robojs/server': '^1.0.0'
			}
		}
		const packages = getRoboPackages(pkg)
		expect(packages).toContain('@robojs/discordjs')
		expect(packages).toContain('@robojs/server')
	})

	it('should check devDependencies too', () => {
		const pkg: ParsedPackageJson = {
			devDependencies: { '@robojs/mock': '^1.0.0' }
		}
		const packages = getRoboPackages(pkg)
		expect(packages).toContain('@robojs/mock')
	})

	it('should return empty array for no Robo packages', () => {
		const pkg: ParsedPackageJson = {
			dependencies: { express: '^4.0.0' }
		}
		const packages = getRoboPackages(pkg)
		expect(packages).toHaveLength(0)
	})
})

describe('determineProjectKind', () => {
	it('should detect bot project', () => {
		const pkg: ParsedPackageJson = {
			dependencies: { '@robojs/discordjs': '^1.0.0' }
		}
		const kind = determineProjectKind(['@robojs/discordjs'], false, pkg)
		expect(kind).toBe('bot')
	})

	it('should detect bot+api project', () => {
		const pkg: ParsedPackageJson = {
			dependencies: {
				'@robojs/discordjs': '^1.0.0',
				'@robojs/server': '^1.0.0'
			}
		}
		const kind = determineProjectKind(['@robojs/discordjs', '@robojs/server'], true, pkg)
		expect(kind).toBe('bot+api')
	})

	it('should detect activity project', () => {
		const pkg: ParsedPackageJson = {
			dependencies: { '@discord/embedded-app-sdk': '^1.0.0' }
		}
		const kind = determineProjectKind([], false, pkg)
		expect(kind).toBe('activity')
	})

	it('should detect activity with @robojs/patch', () => {
		const pkg: ParsedPackageJson = {
			dependencies: { '@robojs/patch': '^1.0.0' }
		}
		const kind = determineProjectKind(['@robojs/patch'], false, pkg)
		expect(kind).toBe('activity')
	})

	it('should return unknown for non-Robo project', () => {
		const pkg: ParsedPackageJson = {
			dependencies: { express: '^4.0.0' }
		}
		const kind = determineProjectKind([], false, pkg)
		expect(kind).toBe('unknown')
	})
})

describe('detectRoboProject', () => {
	it('should return null for non-Robo project', async () => {
		const provider = createMockProvider({
			'/package.json': JSON.stringify({ name: 'express-app', dependencies: { express: '^4.0.0' } })
		})

		const result = await detectRoboProject(provider)
		expect(result).toBeNull()
	})

	it('should detect bot project with commands dir', async () => {
		const provider = createMockProvider(
			{
				'/package.json': JSON.stringify({
					dependencies: { 'robo.js': '^1.0.0', '@robojs/discordjs': '^1.0.0' }
				}),
				'/src/commands/ping.ts': 'export default () => "pong"'
			},
			['/src/commands']
		)

		const result = await detectRoboProject(provider)
		expect(result).not.toBeNull()
		expect(result?.kind).toBe('bot')
		expect(result?.commandsDir).toBe('/src/commands')
		expect(result?.plugins).toContain('@robojs/discordjs')
	})

	it('should detect mock availability', async () => {
		const provider = createMockProvider(
			{
				'/package.json': JSON.stringify({
					dependencies: { 'robo.js': '^1.0.0' },
					devDependencies: { '@robojs/mock': '^1.0.0' }
				})
			},
			['/src/commands']
		)

		const result = await detectRoboProject(provider)
		expect(result).not.toBeNull()
		expect(result?.hasMock).toBe(true)
	})

	it('should detect all Robo directories', async () => {
		const provider = createMockProvider(
			{
				'/package.json': JSON.stringify({
					dependencies: { 'robo.js': '^1.0.0', '@robojs/discordjs': '^1.0.0', '@robojs/server': '^1.0.0' }
				}),
				'/src/commands/ping.ts': '',
				'/src/events/ready.ts': '',
				'/src/api/health.ts': '',
				'/src/robo/flashcore/User.ts': ''
			},
			['/src/commands', '/src/events', '/src/api', '/src/robo/flashcore']
		)

		const result = await detectRoboProject(provider)
		expect(result).not.toBeNull()
		expect(result?.kind).toBe('bot+api')
		expect(result?.commandsDir).toBe('/src/commands')
		expect(result?.eventsDir).toBe('/src/events')
		expect(result?.apiDir).toBe('/src/api')
		expect(result?.flashcoreDir).toBe('/src/robo/flashcore')
	})

	it('should return null when no package.json exists', async () => {
		const provider = createMockProvider({})

		const result = await detectRoboProject(provider)
		expect(result).toBeNull()
	})

	it('should accept pre-parsed package.json', async () => {
		const provider = createMockProvider({}, ['/src/commands'])

		const pkg: ParsedPackageJson = {
			dependencies: { 'robo.js': '^1.0.0', '@robojs/discordjs': '^1.0.0' }
		}

		const result = await detectRoboProject(provider, pkg)
		expect(result).not.toBeNull()
		expect(result?.kind).toBe('bot')
	})
})

describe('buildRoboOverview', () => {
	it('should scan commands', async () => {
		const provider = createMockProvider(
			{
				'/src/commands/ping.ts': '',
				'/src/commands/help.ts': '',
				'/src/commands/user/profile.ts': ''
			},
			['/src/commands', '/src/commands/user']
		)

		const signals = {
			kind: 'bot' as const,
			plugins: ['@robojs/discordjs'],
			commandsDir: '/src/commands',
			hasMock: false
		}

		const overview = await buildRoboOverview(provider, signals)
		expect(overview.commands).toBeDefined()
		expect(overview.commands?.length).toBeGreaterThan(0)
	})

	it('should scan events', async () => {
		const provider = createMockProvider(
			{
				'/src/events/ready.ts': '',
				'/src/events/messageCreate.ts': ''
			},
			['/src/events']
		)

		const signals = {
			kind: 'bot' as const,
			plugins: ['@robojs/discordjs'],
			eventsDir: '/src/events',
			hasMock: false
		}

		const overview = await buildRoboOverview(provider, signals)
		expect(overview.events).toBeDefined()
		expect(overview.events).toContain('ready')
		expect(overview.events).toContain('messageCreate')
	})

	it('should scan API routes', async () => {
		const provider = createMockProvider(
			{
				'/src/api/health.ts': '',
				'/src/api/users/[id].ts': ''
			},
			['/src/api', '/src/api/users']
		)

		const signals = {
			kind: 'bot+api' as const,
			plugins: ['@robojs/server'],
			apiDir: '/src/api',
			hasMock: false
		}

		const overview = await buildRoboOverview(provider, signals)
		expect(overview.apiRoutes).toBeDefined()
		expect(overview.apiRoutes?.length).toBeGreaterThan(0)
	})

	it('should include mock support status', async () => {
		const provider = createMockProvider({}, [])

		const signals = {
			kind: 'bot' as const,
			plugins: ['@robojs/mock'],
			hasMock: true
		}

		const overview = await buildRoboOverview(provider, signals)
		expect(overview.mock?.supported).toBe(true)
	})
})

describe('getRoboVersion', () => {
	it('should get version from dependencies', () => {
		const pkg: ParsedPackageJson = {
			dependencies: { 'robo.js': '^1.2.3' }
		}
		expect(getRoboVersion(pkg)).toBe('^1.2.3')
	})

	it('should get version from devDependencies', () => {
		const pkg: ParsedPackageJson = {
			devDependencies: { 'robo.js': '~2.0.0' }
		}
		expect(getRoboVersion(pkg)).toBe('~2.0.0')
	})

	it('should return undefined if not installed', () => {
		const pkg: ParsedPackageJson = {
			dependencies: { express: '^4.0.0' }
		}
		expect(getRoboVersion(pkg)).toBeUndefined()
	})
})

describe('hasRoboConfig', () => {
	it('should detect robo.config.ts', async () => {
		const provider = createMockProvider({
			'/robo.config.ts': 'export default {}'
		})

		expect(await hasRoboConfig(provider)).toBe(true)
	})

	it('should detect robo.config.js', async () => {
		const provider = createMockProvider({
			'/robo.config.js': 'module.exports = {}'
		})

		expect(await hasRoboConfig(provider)).toBe(true)
	})

	it('should detect robo.config.mjs', async () => {
		const provider = createMockProvider({
			'/robo.config.mjs': 'export default {}'
		})

		expect(await hasRoboConfig(provider)).toBe(true)
	})

	it('should return false if no config file', async () => {
		const provider = createMockProvider({})

		expect(await hasRoboConfig(provider)).toBe(false)
	})
})
