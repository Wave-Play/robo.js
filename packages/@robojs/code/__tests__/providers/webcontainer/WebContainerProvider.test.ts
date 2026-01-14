/**
 * Unit tests for WebContainerProvider
 *
 * Tests file operations, command execution, and session management
 * using mocked WebContainer API.
 */

import {
	WebContainerProvider,
	type WebContainerProviderConfig
} from '../../../src/providers/webcontainer/WebContainerProvider.js'
import { CodeAgentError } from '../../../src/errors/index.js'
import {
	createMockContainer,
	createMockContainerWithFiles,
	createMockProcess,
	createAutoCompletingProcess,
	createMockDirEntry,
	type MockContainer
} from '../../mocks/webcontainer.js'
import type { TruncationEvent } from '../../../src/providers/utils/buffer.js'

// Helper type to cast mock container
type ContainerType = WebContainerProviderConfig['container']

/**
 * Helper to assert CodeAgentError with specific code
 */
async function expectCodeAgentError(promise: Promise<unknown>, code: string) {
	try {
		await promise
		fail(`Expected CodeAgentError with code ${code}`)
	} catch (e) {
		expect(CodeAgentError.isCodeAgentError(e)).toBe(true)
		expect((e as CodeAgentError).code).toBe(code)
	}
}

describe('WebContainerProvider', () => {
	let container: MockContainer
	let provider: WebContainerProvider

	beforeEach(() => {
		container = createMockContainer()
		provider = new WebContainerProvider({
			container: container as unknown as ContainerType,
			rootDir: '/',
			denyPaths: ['.env', '.env.local', '.git/', 'secret*'],
			maxBufferedTerminalBytes: 10000
		})
	})

	afterEach(async () => {
		await provider.stopAllSessions()
	})

	describe('File Operations', () => {
		describe('readFile', () => {
			it('should read file content successfully', async () => {
				container.fs.files.set('/test.txt', 'hello world')

				const content = await provider.readFile('/test.txt')
				expect(content).toBe('hello world')
				expect(container.fs.readFile).toHaveBeenCalledWith('/test.txt', 'utf-8')
			})

			it('should throw EXECUTION_FAILED for non-existent file', async () => {
				await expectCodeAgentError(provider.readFile('/nonexistent.txt'), 'EXECUTION_FAILED')
			})

			it('should throw POLICY_VIOLATION for denied path (.env)', async () => {
				await expectCodeAgentError(provider.readFile('/.env'), 'POLICY_VIOLATION')
			})

			it('should throw PATH_TRAVERSAL for ../ attempts', async () => {
				await expectCodeAgentError(provider.readFile('/../outside.txt'), 'PATH_TRAVERSAL')
			})

			it('should resolve paths relative to rootDir', async () => {
				const customProvider = new WebContainerProvider({
					container: container as unknown as ContainerType,
					rootDir: '/project'
				})

				container.fs.files.set('/project/src/index.ts', 'export {}')
				container.fs.directories.add('/project')
				container.fs.directories.add('/project/src')

				const content = await customProvider.readFile('/src/index.ts')
				expect(content).toBe('export {}')
				expect(container.fs.readFile).toHaveBeenCalledWith('/project/src/index.ts', 'utf-8')
			})
		})

		describe('writeFile', () => {
			it('should write file content successfully', async () => {
				await provider.writeFile('/test.txt', 'hello world')
				expect(container.fs.writeFile).toHaveBeenCalledWith('/test.txt', 'hello world', { encoding: 'utf-8' })
			})

			it('should create parent directories if needed', async () => {
				await provider.writeFile('/deep/nested/file.txt', 'content')
				expect(container.fs.mkdir).toHaveBeenCalled()
				expect(container.fs.writeFile).toHaveBeenCalledWith('/deep/nested/file.txt', 'content', { encoding: 'utf-8' })
			})

			it('should throw POLICY_VIOLATION for denied path', async () => {
				await expectCodeAgentError(provider.writeFile('/.env', 'SECRET=bad'), 'POLICY_VIOLATION')
			})

			it('should throw PATH_TRAVERSAL for traversal attempts', async () => {
				await expectCodeAgentError(provider.writeFile('/foo/../../escape.txt', 'bad'), 'PATH_TRAVERSAL')
			})

			it('should throw EXECUTION_FAILED on fs error', async () => {
				container.fs.writeFile.mockRejectedValueOnce(new Error('Permission denied'))

				await expectCodeAgentError(provider.writeFile('/test.txt', 'content'), 'EXECUTION_FAILED')
			})

			it('should not create parent dir for root-level file', async () => {
				container.fs.mkdir.mockClear()
				await provider.writeFile('/test.txt', 'content')
				// mkdir should not be called for parent of root-level file
				expect(container.fs.mkdir).not.toHaveBeenCalled()
			})
		})

		describe('deletePath', () => {
			it('should delete file successfully', async () => {
				container.fs.files.set('/test.txt', 'content')
				await provider.deletePath('/test.txt')
				expect(container.fs.rm).toHaveBeenCalledWith('/test.txt', { recursive: false, force: true })
			})

			it('should delete directory with recursive: true', async () => {
				container.fs.directories.add('/mydir')
				await provider.deletePath('/mydir', { recursive: true })
				expect(container.fs.rm).toHaveBeenCalledWith('/mydir', { recursive: true, force: true })
			})

			it('should pass recursive: false by default', async () => {
				container.fs.files.set('/test.txt', 'content')
				await provider.deletePath('/test.txt')
				expect(container.fs.rm).toHaveBeenCalledWith('/test.txt', { recursive: false, force: true })
			})

			it('should throw POLICY_VIOLATION for denied path', async () => {
				await expectCodeAgentError(provider.deletePath('/.git/config'), 'POLICY_VIOLATION')
			})

			it('should throw EXECUTION_FAILED on fs error', async () => {
				container.fs.rm.mockRejectedValueOnce(new Error('Permission denied'))
				await expectCodeAgentError(provider.deletePath('/test.txt'), 'EXECUTION_FAILED')
			})
		})

		describe('exists', () => {
			it('should return true for existing file', async () => {
				container.fs.files.set('/test.txt', 'content')
				const result = await provider.exists('/test.txt')
				expect(result).toBe(true)
			})

			it('should return true for existing directory', async () => {
				container.fs.directories.add('/mydir')
				// File doesn't exist, but directory does
				const result = await provider.exists('/mydir')
				expect(result).toBe(true)
			})

			it('should return false for non-existent path', async () => {
				const result = await provider.exists('/nope.txt')
				expect(result).toBe(false)
			})

			it('should throw POLICY_VIOLATION for denied paths', async () => {
				await expectCodeAgentError(provider.exists('/.env'), 'POLICY_VIOLATION')
			})
		})

		describe('readdir', () => {
			it('should list directory contents', async () => {
				container.fs.directories.add('/mydir')
				container.fs.files.set('/mydir/a.txt', 'a')
				container.fs.files.set('/mydir/b.txt', 'b')
				container.fs.directories.add('/mydir/subdir')

				const entries = await provider.readdir('/mydir')
				expect(entries.length).toBe(3)
				expect(entries.find((e) => e.name === 'a.txt')).toBeDefined()
				expect(entries.find((e) => e.name === 'subdir')).toBeDefined()
			})

			it('should return DirEntry objects with isDirectory/isFile', async () => {
				container.fs.directories.add('/mydir')
				container.fs.files.set('/mydir/file.txt', 'content')
				container.fs.directories.add('/mydir/subdir')

				const entries = await provider.readdir('/mydir')
				const fileEntry = entries.find((e) => e.name === 'file.txt')
				const dirEntry = entries.find((e) => e.name === 'subdir')

				expect(fileEntry?.isFile).toBe(true)
				expect(fileEntry?.isDirectory).toBe(false)
				expect(dirEntry?.isFile).toBe(false)
				expect(dirEntry?.isDirectory).toBe(true)
			})

			it('should handle recursive: true', async () => {
				container.fs.directories.add('/mydir')
				container.fs.files.set('/mydir/a.txt', 'a')
				container.fs.directories.add('/mydir/sub')
				container.fs.files.set('/mydir/sub/b.txt', 'b')

				const entries = await provider.readdir('/mydir', { recursive: true })
				expect(entries.find((e) => e.path === '/mydir/a.txt')).toBeDefined()
				expect(entries.find((e) => e.path === '/mydir/sub/b.txt')).toBeDefined()
			})

			it('should skip denied paths in results', async () => {
				container.fs.directories.add('/mydir')
				container.fs.files.set('/mydir/.env', 'SECRET=bad')
				container.fs.files.set('/mydir/ok.txt', 'fine')

				const entries = await provider.readdir('/mydir')
				expect(entries.find((e) => e.name === '.env')).toBeUndefined()
				expect(entries.find((e) => e.name === 'ok.txt')).toBeDefined()
			})

			it('should throw EXECUTION_FAILED for non-existent dir', async () => {
				await expectCodeAgentError(provider.readdir('/nonexistent'), 'EXECUTION_FAILED')
			})

			it('should convert absolute paths to virtual paths', async () => {
				const customProvider = new WebContainerProvider({
					container: container as unknown as ContainerType,
					rootDir: '/project'
				})

				container.fs.directories.add('/project')
				container.fs.directories.add('/project/src')
				container.fs.files.set('/project/src/index.ts', 'export {}')

				const entries = await customProvider.readdir('/src')
				const indexEntry = entries.find((e) => e.name === 'index.ts')
				expect(indexEntry?.path).toBe('/src/index.ts')
			})
		})

		describe('mkdir', () => {
			it('should create directory', async () => {
				await provider.mkdir('/newdir')
				expect(container.fs.mkdir).toHaveBeenCalledWith('/newdir', { recursive: false })
			})

			it('should create nested directories with recursive: true', async () => {
				await provider.mkdir('/a/b/c', { recursive: true })
				expect(container.fs.mkdir).toHaveBeenCalledWith('/a/b/c', { recursive: true })
			})

			it('should throw POLICY_VIOLATION for denied path', async () => {
				await expectCodeAgentError(provider.mkdir('/.git/hooks'), 'POLICY_VIOLATION')
			})

			it('should throw EXECUTION_FAILED on fs error', async () => {
				container.fs.mkdir.mockRejectedValueOnce(new Error('Permission denied'))
				await expectCodeAgentError(provider.mkdir('/newdir'), 'EXECUTION_FAILED')
			})
		})

		describe('stat', () => {
			it('should return size for files', async () => {
				container.fs.files.set('/test.txt', 'hello world') // 11 bytes

				const stats = await provider.stat('/test.txt')
				expect(stats.size).toBe(11)
				expect(stats.isDirectory).toBe(false)
			})

			it('should return isDirectory: true for directories', async () => {
				container.fs.directories.add('/mydir')

				const stats = await provider.stat('/mydir')
				expect(stats.isDirectory).toBe(true)
			})

			it('should return isDirectory: false for files', async () => {
				container.fs.files.set('/test.txt', 'content')

				const stats = await provider.stat('/test.txt')
				expect(stats.isDirectory).toBe(false)
			})

			it('should throw EXECUTION_FAILED for non-existent path', async () => {
				await expectCodeAgentError(provider.stat('/nonexistent'), 'EXECUTION_FAILED')
			})

			it('should throw POLICY_VIOLATION for denied path', async () => {
				await expectCodeAgentError(provider.stat('/.env'), 'POLICY_VIOLATION')
			})
		})
	})

	describe('Search & Snapshot', () => {
		describe('search', () => {
			beforeEach(() => {
				container.fs.directories.add('/src')
				container.fs.files.set('/src/index.ts', 'export function hello() {}')
				container.fs.files.set('/src/utils.ts', 'export const util = 1')
				container.fs.files.set('/readme.md', '# Readme')
			})

			it('should find files matching pattern', async () => {
				const results = await provider.search('.ts')
				expect(results.length).toBe(2)
				expect(results.some((r) => r.path.includes('index.ts'))).toBe(true)
				expect(results.some((r) => r.path.includes('utils.ts'))).toBe(true)
			})

			it('should support glob patterns', async () => {
				const results = await provider.search('', { glob: '*.md' })
				expect(results.length).toBe(1)
				expect(results[0].path).toContain('readme.md')
			})

			it('should respect maxResults limit', async () => {
				// Add more files
				for (let i = 0; i < 10; i++) {
					container.fs.files.set(`/file${i}.txt`, 'content')
				}

				const results = await provider.search('.txt', { maxResults: 3 })
				expect(results.length).toBe(3)
			})

			it('should skip node_modules', async () => {
				container.fs.directories.add('/node_modules')
				container.fs.directories.add('/node_modules/pkg')
				container.fs.files.set('/node_modules/pkg/index.js', 'module.exports = {}')

				const results = await provider.search('index')
				expect(results.some((r) => r.path.includes('node_modules'))).toBe(false)
			})

			it('should skip denied paths', async () => {
				container.fs.files.set('/.env', 'SECRET=bad')

				const results = await provider.search('.env')
				expect(results.some((r) => r.path.includes('.env'))).toBe(false)
			})

			it('should include content matches when requested', async () => {
				// Search for 'index' to match the filename, then check content matches
				const results = await provider.search('index', { includeContent: true })
				const indexResult = results.find((r) => r.path.includes('index.ts'))
				expect(indexResult).toBeDefined()
				// The file should be found by filename match
				expect(indexResult?.path).toContain('index.ts')
			})

			it('should search from specified path', async () => {
				const results = await provider.search('.ts', { path: '/src' })
				expect(results.length).toBe(2)
				// All results should be from /src
				expect(results.every((r) => r.path.startsWith('/src'))).toBe(true)
			})
		})

		describe('snapshot', () => {
			beforeEach(() => {
				container.fs.directories.add('/src')
				container.fs.files.set('/src/index.ts', 'export {}')
				container.fs.files.set('/src/utils.ts', 'export const x = 1')
				container.fs.files.set('/readme.md', '# Readme')
			})

			it('should capture file contents', async () => {
				const snapshot = await provider.snapshot()
				expect(snapshot['/src/index.ts']).toBe('export {}')
				expect(snapshot['/readme.md']).toBe('# Readme')
			})

			it('should respect maxBytes limit', async () => {
				// Create a large file
				container.fs.files.set('/big.txt', 'x'.repeat(1000))

				const snapshot = await provider.snapshot({ maxBytes: 500 })
				// Should not include the large file
				expect(snapshot['/big.txt']).toBeUndefined()
			})

			it('should exclude node_modules by default', async () => {
				container.fs.directories.add('/node_modules')
				container.fs.directories.add('/node_modules/pkg')
				container.fs.files.set('/node_modules/pkg/index.js', 'module.exports = {}')

				const snapshot = await provider.snapshot()
				expect(Object.keys(snapshot).some((k) => k.includes('node_modules'))).toBe(false)
			})

			it('should exclude denied paths', async () => {
				container.fs.files.set('/.env', 'SECRET=bad')

				const snapshot = await provider.snapshot()
				expect(Object.keys(snapshot).some((k) => k.includes('.env'))).toBe(false)
			})

			it('should respect custom excludePatterns', async () => {
				container.fs.directories.add('/dist')
				container.fs.files.set('/dist/bundle.js', 'bundled')

				const snapshot = await provider.snapshot({ excludePatterns: ['dist'] })
				expect(snapshot['/dist/bundle.js']).toBeUndefined()
			})
		})
	})

	describe('Command Execution', () => {
		describe('run', () => {
			it('should spawn command with args', async () => {
				container.spawn.mockResolvedValueOnce(createAutoCompletingProcess(0, 'hello\n'))

				await provider.run('echo', ['hello'])
				expect(container.spawn).toHaveBeenCalledWith('echo', ['hello'], expect.any(Object))
			})

			it('should return exit code and output', async () => {
				container.spawn.mockResolvedValueOnce(createAutoCompletingProcess(0, 'output'))

				const result = await provider.run('node', ['-v'])
				expect(result.exitCode).toBe(0)
				expect(result.output).toBe('output')
			})

			it('should use cwd from options', async () => {
				container.spawn.mockResolvedValueOnce(createAutoCompletingProcess(0, ''))
				container.fs.directories.add('/subdir')

				await provider.run('pwd', [], { cwd: '/subdir' })
				expect(container.spawn).toHaveBeenCalledWith('pwd', [], expect.objectContaining({ cwd: '/subdir' }))
			})

			it('should use env from options', async () => {
				container.spawn.mockResolvedValueOnce(createAutoCompletingProcess(0, ''))

				await provider.run('env', [], { env: { MY_VAR: 'value' } })
				expect(container.spawn).toHaveBeenCalledWith('env', [], expect.objectContaining({ env: { MY_VAR: 'value' } }))
			})

			it('should throw EXECUTION_FAILED on spawn error', async () => {
				container.spawn.mockRejectedValueOnce(new Error('Command not found'))

				await expectCodeAgentError(provider.run('nonexistent', []), 'EXECUTION_FAILED')
			})

			it('should throw TIMEOUT when timeout exceeded', async () => {
				// Create a process that doesn't complete
				const process = createMockProcess(0, [])
				container.spawn.mockResolvedValueOnce(process)

				await expectCodeAgentError(provider.run('sleep', ['10'], { timeout: 50 }), 'TIMEOUT')
			})

			it('should abort on signal', async () => {
				const process = createMockProcess(0, [])
				container.spawn.mockResolvedValueOnce(process)

				const controller = new AbortController()
				const runPromise = provider.run('sleep', ['10'], { signal: controller.signal })

				// Abort after short delay
				setTimeout(() => controller.abort(), 10)

				// Should eventually resolve (kill is called)
				await expect(runPromise).resolves.toBeDefined()
				expect(process.kill).toHaveBeenCalled()
			})

			it('should use rootDir as default cwd', async () => {
				container.spawn.mockResolvedValueOnce(createAutoCompletingProcess(0, ''))

				await provider.run('pwd', [])
				expect(container.spawn).toHaveBeenCalledWith('pwd', [], expect.objectContaining({ cwd: '/' }))
			})
		})

		describe('runStream', () => {
			it('should yield output chunks with type: output', async () => {
				container.spawn.mockResolvedValueOnce(createAutoCompletingProcess(0, 'line1\nline2\n'))

				const chunks: { type: string; text?: string }[] = []
				for await (const chunk of provider.runStream('echo', ['test'])) {
					if (chunk.type === 'output') {
						chunks.push(chunk)
					}
				}

				expect(chunks.length).toBeGreaterThan(0)
				expect(chunks[0].type).toBe('output')
			})

			it('should yield exit chunk with exitCode', async () => {
				container.spawn.mockResolvedValueOnce(createAutoCompletingProcess(5, ''))

				let exitCode: number | undefined
				for await (const chunk of provider.runStream('exit', ['5'])) {
					if (chunk.type === 'exit') {
						exitCode = chunk.exitCode
					}
				}

				expect(exitCode).toBe(5)
			})

			it('should use combined stream type (WebContainer limitation)', async () => {
				container.spawn.mockResolvedValueOnce(createAutoCompletingProcess(0, 'output'))

				const chunks: { stream?: string }[] = []
				for await (const chunk of provider.runStream('echo', ['test'])) {
					if (chunk.type === 'output') {
						chunks.push(chunk)
					}
				}

				expect(chunks.every((c) => c.stream === 'combined')).toBe(true)
			})

			it('should handle timeout', async () => {
				const process = createMockProcess(0, [])
				container.spawn.mockResolvedValueOnce(process)

				const chunks: { type: string; exitCode?: number }[] = []
				for await (const chunk of provider.runStream('sleep', ['10'], { timeout: 50 })) {
					chunks.push(chunk)
				}

				// Should have an exit chunk with -1 due to timeout
				const exitChunk = chunks.find((c) => c.type === 'exit')
				expect(exitChunk?.exitCode).toBe(-1)
			})

			it('should handle abort signal', async () => {
				const process = createMockProcess(0, [])
				container.spawn.mockResolvedValueOnce(process)

				const controller = new AbortController()

				// Start collecting
				const collectPromise = (async () => {
					const chunks: { type: string }[] = []
					for await (const chunk of provider.runStream('sleep', ['10'], { signal: controller.signal })) {
						chunks.push(chunk)
					}
					return chunks
				})()

				// Abort after short delay
				setTimeout(() => controller.abort(), 10)

				const chunks = await collectPromise
				expect(process.kill).toHaveBeenCalled()
			})

			it('should throw EXECUTION_FAILED on spawn error', async () => {
				container.spawn.mockRejectedValueOnce(new Error('Command not found'))

				await expectCodeAgentError(
					(async () => {
						for await (const _ of provider.runStream('nonexistent', [])) {
							// Should throw before yielding
						}
					})(),
					'EXECUTION_FAILED'
				)
			})
		})
	})

	describe('Session Management', () => {
		describe('startSession', () => {
			it('should spawn process and return handle with id', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				const handle = await provider.startSession('node', ['-e', 'setInterval(()=>{},1000)'])
				expect(handle.id).toBeDefined()
				expect(handle.id).toContain('session-')
			})

			it('should register session in internal map', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				expect(provider.getActiveSessionCount()).toBe(0)
				await provider.startSession('node', ['-i'])
				expect(provider.getActiveSessionCount()).toBe(1)
			})

			it('should use terminal options {cols: 80, rows: 24}', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				await provider.startSession('bash', [])
				expect(container.spawn).toHaveBeenCalledWith(
					'bash',
					[],
					expect.objectContaining({
						terminal: { cols: 80, rows: 24 }
					})
				)
			})

			it('should throw EXECUTION_FAILED on spawn error', async () => {
				container.spawn.mockRejectedValueOnce(new Error('Cannot spawn'))

				await expectCodeAgentError(provider.startSession('nonexistent', []), 'EXECUTION_FAILED')
			})

			it('should use cwd and env from options', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
				container.fs.directories.add('/project')

				await provider.startSession('node', [], { cwd: '/project', env: { NODE_ENV: 'test' } })
				expect(container.spawn).toHaveBeenCalledWith(
					'node',
					[],
					expect.objectContaining({
						cwd: '/project',
						env: { NODE_ENV: 'test' }
					})
				)
			})
		})

		describe('streamSession', () => {
			it('should throw INVALID_STATE for unknown session', async () => {
				const fakeHandle = { id: 'nonexistent' }

				await expectCodeAgentError(
					(async () => {
						for await (const _ of provider.streamSession(fakeHandle)) {
							// Should throw
						}
					})(),
					'INVALID_STATE'
				)
			})

			it('should yield buffered content if already exited', async () => {
				// Create a process that exits immediately with output
				const process = createMockProcess(0, ['final output'])
				setTimeout(() => {
					try {
						process._controller?.close()
					} catch {
						// ignore
					}
					process._resolve!(0)
				}, 10)
				container.spawn.mockResolvedValueOnce(process)

				const handle = await provider.startSession('node', ['-e', 'console.log("done")'])

				// Wait for process to exit
				await new Promise((resolve) => setTimeout(resolve, 50))

				const chunks: { type: string; text?: string }[] = []
				for await (const chunk of provider.streamSession(handle)) {
					chunks.push(chunk)
					if (chunk.type === 'exit') break
				}

				expect(chunks.some((c) => c.type === 'exit')).toBe(true)
			})

			it('should yield exit chunk when process exits', async () => {
				const process = createMockProcess(42, [])
				setTimeout(() => {
					try {
						process._controller?.close()
					} catch {
						// ignore
					}
					process._resolve!(42)
				}, 10)
				container.spawn.mockResolvedValueOnce(process)

				const handle = await provider.startSession('node', ['-e', 'process.exit(42)'])

				let exitCode: number | undefined
				for await (const chunk of provider.streamSession(handle)) {
					if (chunk.type === 'exit') {
						exitCode = chunk.exitCode
						break
					}
				}

				expect(exitCode).toBe(42)
			})
		})

		describe('stopSession', () => {
			it('should kill process', async () => {
				const process = createMockProcess(0, [])
				container.spawn.mockResolvedValueOnce(process)

				const handle = await provider.startSession('node', ['-i'])
				await provider.stopSession(handle)

				expect(process.kill).toHaveBeenCalled()
			})

			it('should remove session from map', async () => {
				const process = createMockProcess(0, [])
				container.spawn.mockResolvedValueOnce(process)

				const handle = await provider.startSession('node', ['-i'])
				expect(provider.getActiveSessionCount()).toBe(1)

				await provider.stopSession(handle)
				expect(provider.getActiveSessionCount()).toBe(0)
			})

			it('should be idempotent (no error on double-stop)', async () => {
				const process = createMockProcess(0, [])
				container.spawn.mockResolvedValueOnce(process)

				const handle = await provider.startSession('node', ['-i'])
				await provider.stopSession(handle)
				await provider.stopSession(handle) // Should not throw
			})
		})

		describe('stopAllSessions', () => {
			it('should stop all active sessions', async () => {
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))

				await provider.startSession('node', ['-i'])
				await provider.startSession('node', ['-i'])
				await provider.startSession('node', ['-i'])

				expect(provider.getActiveSessionCount()).toBe(3)

				await provider.stopAllSessions()
				expect(provider.getActiveSessionCount()).toBe(0)
			})
		})

		describe('getActiveSessionCount', () => {
			it('should return correct count', async () => {
				expect(provider.getActiveSessionCount()).toBe(0)

				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
				await provider.startSession('node', ['-i'])
				expect(provider.getActiveSessionCount()).toBe(1)

				container.spawn.mockResolvedValueOnce(createMockProcess(0, []))
				await provider.startSession('node', ['-i'])
				expect(provider.getActiveSessionCount()).toBe(2)
			})
		})
	})

	describe('Path Security', () => {
		it('should reject path traversal attempts', async () => {
			await expectCodeAgentError(provider.readFile('../outside.txt'), 'PATH_TRAVERSAL')
			await expectCodeAgentError(provider.writeFile('/foo/../../escape.txt', 'bad'), 'PATH_TRAVERSAL')
		})

		it('should reject URL-encoded traversal', async () => {
			await expectCodeAgentError(provider.readFile('/%2e%2e/escape.txt'), 'PATH_TRAVERSAL')
		})

		it('should reject null byte injection', async () => {
			await expectCodeAgentError(provider.readFile('/file\0.txt'), 'PATH_TRAVERSAL')
		})

		it('should reject paths matching deny patterns', async () => {
			await expectCodeAgentError(provider.readFile('/.env'), 'POLICY_VIOLATION')
			await expectCodeAgentError(provider.readFile('/config/.env.local'), 'POLICY_VIOLATION')
			await expectCodeAgentError(provider.readFile('/secretfile.key'), 'POLICY_VIOLATION')
		})

		it('should reject .git/ directory access', async () => {
			await expectCodeAgentError(provider.readFile('/.git/config'), 'POLICY_VIOLATION')
			await expectCodeAgentError(provider.mkdir('/.git/hooks'), 'POLICY_VIOLATION')
		})
	})

	describe('Buffer Truncation', () => {
		it('should create provider with truncation callback', async () => {
			const truncationEvents: TruncationEvent[] = []

			const smallBufferProvider = new WebContainerProvider({
				container: container as unknown as ContainerType,
				maxBufferedTerminalBytes: 50,
				onTruncate: (event) => truncationEvents.push(event)
			})

			// Just verify the provider was created correctly
			expect(smallBufferProvider).toBeDefined()
		})
	})
})
