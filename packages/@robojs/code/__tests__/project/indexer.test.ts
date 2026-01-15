/**
 * Unit tests for ProjectIndexer
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import { ProjectIndexer, createProjectIndexer, type ProjectIndexerConfig } from '../../src/project/indexer.js'
import type { ExecutionProvider } from '../../src/types/execution.js'
import type { AgentPolicy } from '../../src/types/policy.js'
import type { DirEntry, FileStat } from '../../src/types/terminal.js'

/**
 * Create a mock provider for testing
 */
function createMockProvider(files: Record<string, string> = {}, options: { mtimeMs?: number } = {}): ExecutionProvider {
	const { mtimeMs = 1000000 } = options

	const mockProvider: ExecutionProvider = {
		readFile: jest.fn(async (path: string) => {
			if (files[path]) return files[path]
			throw new Error(`File not found: ${path}`)
		}),
		writeFile: jest.fn(async () => {}),
		deletePath: jest.fn(async () => {}),
		exists: jest.fn(async (path: string) => {
			return path in files
		}),
		readdir: jest.fn(async (path: string, opts?: { recursive?: boolean }): Promise<DirEntry[]> => {
			const entries: DirEntry[] = []
			const seenDirs = new Set<string>()

			for (const filePath of Object.keys(files)) {
				// Check if file is under the requested path
				const prefix = path === '/' ? '/' : path + '/'
				if (!filePath.startsWith(prefix) && filePath !== path) continue

				const relativePath = filePath.slice(prefix.length)
				const parts = relativePath.split('/').filter(Boolean)

				if (opts?.recursive) {
					// Add all intermediate directories
					let currentPath = prefix.slice(0, -1)
					for (let i = 0; i < parts.length - 1; i++) {
						currentPath += '/' + parts[i]
						if (!seenDirs.has(currentPath)) {
							seenDirs.add(currentPath)
							entries.push({
								name: parts[i],
								path: currentPath,
								isDirectory: true,
								isFile: false
							})
						}
					}

					// Add the file
					if (parts.length > 0) {
						entries.push({
							name: parts[parts.length - 1],
							path: filePath,
							isDirectory: false,
							isFile: true
						})
					}
				} else {
					// Non-recursive: only immediate children
					if (parts.length === 1) {
						entries.push({
							name: parts[0],
							path: filePath,
							isDirectory: false,
							isFile: true
						})
					} else if (parts.length > 1 && !seenDirs.has(prefix + parts[0])) {
						seenDirs.add(prefix + parts[0])
						entries.push({
							name: parts[0],
							path: prefix + parts[0],
							isDirectory: true,
							isFile: false
						})
					}
				}
			}

			return entries
		}),
		mkdir: jest.fn(async () => {}),
		stat: jest.fn(async (path: string): Promise<FileStat> => {
			if (files[path]) {
				return { size: files[path].length, isDirectory: false, mtimeMs }
			}
			// Check if it's a directory
			const prefix = path.endsWith('/') ? path : path + '/'
			if (Object.keys(files).some((f) => f.startsWith(prefix))) {
				return { size: 0, isDirectory: true, mtimeMs }
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

function createPolicy(overrides: Partial<AgentPolicy> = {}): AgentPolicy {
	return {
		autoApprove: false,
		maxIterations: 10,
		commandAllowlist: ['npm', 'node'],
		denyPaths: ['.env', '.git/', 'node_modules/'],
		...overrides
	}
}

describe('ProjectIndexer', () => {
	describe('refresh', () => {
		it('should build index with files and directories', async () => {
			const provider = createMockProvider({
				'/package.json': '{}',
				'/src/index.ts': 'export default {}',
				'/src/utils/helper.ts': 'export function help() {}'
			})
			const policy = createPolicy()
			const indexer = new ProjectIndexer({ provider, policy })

			const index = await indexer.refresh()

			expect(index).toBeDefined()
			expect(index.root).toBe('/')
			expect(index.fingerprint).toBeTruthy()
			expect(index.files.length).toBeGreaterThan(0)
			expect(index.updatedAt).toBeTruthy()
		})

		it('should respect deny paths', async () => {
			const provider = createMockProvider({
				'/package.json': '{}',
				'/src/index.ts': 'export default {}',
				'/.env': 'SECRET=value',
				'/.git/config': 'git config',
				'/node_modules/lodash/index.js': 'module.exports = {}'
			})
			const policy = createPolicy()
			const indexer = new ProjectIndexer({ provider, policy })

			const index = await indexer.refresh()

			const paths = index.files.map((f) => f.path)
			expect(paths).toContain('/package.json')
			expect(paths).toContain('/src/index.ts')
			expect(paths).not.toContain('/.env')
			expect(paths).not.toContain('/.git/config')
			expect(paths).not.toContain('/node_modules/lodash/index.js')
		})

		it('should respect maxFiles cap', async () => {
			const files: Record<string, string> = {}
			for (let i = 0; i < 100; i++) {
				files[`/file${i}.ts`] = `content ${i}`
			}

			const provider = createMockProvider(files)
			const policy = createPolicy({ denyPaths: [] })
			const indexer = new ProjectIndexer({
				provider,
				policy,
				caps: { maxFiles: 50, maxDirs: 100, largeFileThreshold: 256 * 1024 }
			})

			const index = await indexer.refresh()

			expect(index.files.length).toBeLessThanOrEqual(50)
		})

		it('should return cached index if fingerprint unchanged', async () => {
			const provider = createMockProvider({
				'/package.json': '{}',
				'/src/index.ts': 'export default {}'
			})
			const policy = createPolicy({ denyPaths: [] })
			const indexer = new ProjectIndexer({ provider, policy })

			const index1 = await indexer.refresh()
			const index2 = await indexer.refresh()

			expect(index1.fingerprint).toBe(index2.fingerprint)
			expect(index1.updatedAt).toBe(index2.updatedAt) // Same object
		})

		it('should force refresh with force option', async () => {
			const provider = createMockProvider({
				'/package.json': '{}',
				'/src/index.ts': 'export default {}'
			})
			const policy = createPolicy({ denyPaths: [] })
			const indexer = new ProjectIndexer({ provider, policy })

			const index1 = await indexer.refresh()
			// Wait a tiny bit to ensure different timestamp
			await new Promise((resolve) => setTimeout(resolve, 2))
			const index2 = await indexer.refresh({ force: true })

			expect(index2.fingerprint).toBe(index1.fingerprint)
			// With force=true, a new index should be built
			expect(index2).not.toBe(index1) // Different object reference
		})

		it('should detect Robo project signals', async () => {
			const provider = createMockProvider({
				'/package.json': JSON.stringify({
					dependencies: { 'robo.js': '^1.0.0', '@robojs/discordjs': '^1.0.0' }
				}),
				'/src/commands/ping.ts': 'export default () => "pong"'
			})

			// Override stat to handle directories
			const origStat = provider.stat
			;(provider.stat as jest.Mock<typeof provider.stat>).mockImplementation(async (path: string) => {
				if (path === '/src/commands') {
					return { size: 0, isDirectory: true }
				}
				return origStat(path)
			})
			;(provider.exists as jest.Mock<typeof provider.exists>).mockImplementation(async (path: string) => {
				if (path === '/src/commands') return true
				const files = {
					'/package.json': true,
					'/src/commands/ping.ts': true
				} as Record<string, boolean>
				return files[path] ?? false
			})

			const policy = createPolicy({ denyPaths: [] })
			const indexer = new ProjectIndexer({ provider, policy })

			const index = await indexer.refresh()

			expect(index.robo).toBeDefined()
			expect(index.robo?.kind).toBe('bot')
			expect(index.robo?.plugins).toContain('@robojs/discordjs')
		})

		it('should include file sizes', async () => {
			const provider = createMockProvider({
				'/small.txt': 'hello',
				'/large.txt': 'x'.repeat(1000)
			})
			const policy = createPolicy({ denyPaths: [] })
			const indexer = new ProjectIndexer({ provider, policy })

			const index = await indexer.refresh()

			const small = index.files.find((f) => f.path === '/small.txt')
			const large = index.files.find((f) => f.path === '/large.txt')

			expect(small?.size).toBe(5)
			expect(large?.size).toBe(1000)
		})
	})

	describe('getIndex', () => {
		it('should return null before refresh', () => {
			const provider = createMockProvider({})
			const policy = createPolicy()
			const indexer = new ProjectIndexer({ provider, policy })

			expect(indexer.getIndex()).toBeNull()
		})

		it('should return index after refresh', async () => {
			const provider = createMockProvider({
				'/package.json': '{}'
			})
			const policy = createPolicy({ denyPaths: [] })
			const indexer = new ProjectIndexer({ provider, policy })

			await indexer.refresh()
			const index = indexer.getIndex()

			expect(index).not.toBeNull()
			expect(index?.files.length).toBeGreaterThan(0)
		})
	})

	describe('needsRefresh', () => {
		it('should return true before first refresh', async () => {
			const provider = createMockProvider({})
			const policy = createPolicy()
			const indexer = new ProjectIndexer({ provider, policy })

			expect(await indexer.needsRefresh()).toBe(true)
		})

		it('should return false if no changes', async () => {
			const provider = createMockProvider({
				'/package.json': '{}',
				'/src/index.ts': 'export default {}'
			})
			const policy = createPolicy({ denyPaths: [] })
			const indexer = new ProjectIndexer({ provider, policy })

			await indexer.refresh()
			expect(await indexer.needsRefresh()).toBe(false)
		})

		it('should return true if file added', async () => {
			const files: Record<string, string> = {
				'/package.json': '{}',
				'/src/index.ts': 'export default {}'
			}
			const provider = createMockProvider(files)
			const policy = createPolicy({ denyPaths: [] })
			const indexer = new ProjectIndexer({ provider, policy })

			await indexer.refresh()

			// Add a new file
			files['/src/new.ts'] = 'new file'

			expect(await indexer.needsRefresh()).toBe(true)
		})

		it('should return true if file removed', async () => {
			const files: Record<string, string> = {
				'/package.json': '{}',
				'/src/index.ts': 'export default {}',
				'/src/remove.ts': 'to be removed'
			}
			const provider = createMockProvider(files)
			const policy = createPolicy({ denyPaths: [] })
			const indexer = new ProjectIndexer({ provider, policy })

			await indexer.refresh()

			// Remove a file
			delete files['/src/remove.ts']

			expect(await indexer.needsRefresh()).toBe(true)
		})

		it('should return true if file size changed', async () => {
			const files: Record<string, string> = {
				'/package.json': '{}',
				'/src/index.ts': 'export default {}'
			}
			const provider = createMockProvider(files)
			const policy = createPolicy({ denyPaths: [] })
			const indexer = new ProjectIndexer({ provider, policy })

			await indexer.refresh()

			// Modify file content (changes size)
			files['/src/index.ts'] = 'export default { modified: true, with: "more content" }'

			expect(await indexer.needsRefresh()).toBe(true)
		})
	})

	describe('fingerprint stability', () => {
		it('should produce same fingerprint for same files', async () => {
			const files = {
				'/package.json': '{}',
				'/src/index.ts': 'export default {}',
				'/src/utils.ts': 'export function util() {}'
			}

			const provider1 = createMockProvider(files)
			const provider2 = createMockProvider(files)
			const policy = createPolicy({ denyPaths: [] })

			const indexer1 = new ProjectIndexer({ provider: provider1, policy })
			const indexer2 = new ProjectIndexer({ provider: provider2, policy })

			const index1 = await indexer1.refresh()
			const index2 = await indexer2.refresh()

			expect(index1.fingerprint).toBe(index2.fingerprint)
		})

		it('should produce different fingerprint for different files', async () => {
			const provider1 = createMockProvider({
				'/package.json': '{}',
				'/src/a.ts': 'a'
			})
			const provider2 = createMockProvider({
				'/package.json': '{}',
				'/src/b.ts': 'b'
			})
			const policy = createPolicy({ denyPaths: [] })

			const indexer1 = new ProjectIndexer({ provider: provider1, policy })
			const indexer2 = new ProjectIndexer({ provider: provider2, policy })

			const index1 = await indexer1.refresh()
			const index2 = await indexer2.refresh()

			expect(index1.fingerprint).not.toBe(index2.fingerprint)
		})
	})
})

describe('createProjectIndexer', () => {
	it('should create an indexer instance', () => {
		const provider = createMockProvider({})
		const policy = createPolicy()
		const indexer = createProjectIndexer({ provider, policy })

		expect(indexer).toBeInstanceOf(ProjectIndexer)
	})
})
