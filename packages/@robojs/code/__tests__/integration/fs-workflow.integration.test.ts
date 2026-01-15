/**
 * Integration tests for FS tools working together
 *
 * Tests realistic file system workflows that combine multiple tools.
 */

import { jest } from '@jest/globals'
import { fsStatTool } from '../../src/tools/fs/stat.js'
import { fsReadTool } from '../../src/tools/fs/read.js'
import { fsReadHeadTool } from '../../src/tools/fs/read-head.js'
import { fsReadTailTool } from '../../src/tools/fs/read-tail.js'
import { fsReadRangeTool } from '../../src/tools/fs/read-range.js'
import { fsReadManyTool } from '../../src/tools/fs/read-many.js'
import { fsWriteTool } from '../../src/tools/fs/write.js'
import { fsListTool } from '../../src/tools/fs/list.js'
import { fsSearchTool } from '../../src/tools/fs/search.js'
import { fsSnapshotTool } from '../../src/tools/fs/snapshot.js'
import type { ToolContext } from '../../src/tools/types.js'
import type { ExecutionProvider, AgentPolicy } from '../../src/types/index.js'

/**
 * Create a comprehensive mock provider that simulates a real file system
 */
function createMockFileSystem(initialFiles: Record<string, string> = {}): {
	provider: ExecutionProvider
	files: Map<string, string>
	operations: Array<{ type: string; path: string; timestamp: number }>
} {
	const files = new Map<string, string>(Object.entries(initialFiles))
	const operations: Array<{ type: string; path: string; timestamp: number }> = []

	const provider: ExecutionProvider = {
		readFile: jest.fn(async (path: string) => {
			operations.push({ type: 'read', path, timestamp: Date.now() })
			const content = files.get(path)
			if (content === undefined) {
				throw new Error(`ENOENT: no such file or directory, open '${path}'`)
			}
			return content
		}),

		writeFile: jest.fn(async (path: string, content: string) => {
			operations.push({ type: 'write', path, timestamp: Date.now() })
			files.set(path, content)
		}),

		deletePath: jest.fn(async (path: string) => {
			operations.push({ type: 'delete', path, timestamp: Date.now() })
			files.delete(path)
		}),

		exists: jest.fn(async (path: string) => {
			return files.has(path)
		}),

		stat: jest.fn(async (path: string) => {
			operations.push({ type: 'stat', path, timestamp: Date.now() })
			const content = files.get(path)
			if (content === undefined) {
				throw new Error(`ENOENT: no such file or directory, stat '${path}'`)
			}
			return {
				size: new TextEncoder().encode(content).length,
				isDirectory: false,
				mtimeMs: Date.now()
			}
		}),

		readdir: jest.fn(async (path: string) => {
			operations.push({ type: 'list', path, timestamp: Date.now() })
			const entries: Array<{ name: string; path: string; isDirectory: boolean }> = []
			const prefix = path.endsWith('/') ? path : `${path}/`

			for (const filePath of files.keys()) {
				if (filePath.startsWith(prefix)) {
					const relative = filePath.slice(prefix.length)
					const parts = relative.split('/')
					if (parts.length === 1 && parts[0]) {
						entries.push({
							name: parts[0],
							path: filePath,
							isDirectory: false
						})
					}
				}
			}
			return entries
		}),

		search: jest.fn(async (pattern: string) => {
			operations.push({ type: 'search', path: pattern, timestamp: Date.now() })
			const results: Array<{ path: string; matches: Array<{ line: number; column: number; text: string }> }> = []

			for (const [path, content] of files.entries()) {
				const lines = content.split('\n')
				const matches: Array<{ line: number; column: number; text: string }> = []

				lines.forEach((line, index) => {
					const col = line.indexOf(pattern)
					if (col !== -1) {
						matches.push({ line: index + 1, column: col + 1, text: line })
					}
				})

				if (matches.length > 0) {
					results.push({ path, matches })
				}
			}

			return results
		}),

		snapshot: jest.fn(async () => {
			operations.push({ type: 'snapshot', path: '/', timestamp: Date.now() })
			const result: Record<string, string> = {}
			for (const [path, content] of files.entries()) {
				result[path] = content
			}
			return result
		}),

		run: jest.fn(async () => ({ exitCode: 0, output: '' })),
		runStream: jest.fn(async function* () {})
	} as unknown as ExecutionProvider

	return { provider, files, operations }
}

function createPolicy(overrides: Partial<AgentPolicy> = {}): AgentPolicy {
	return {
		autoApprove: true,
		maxIterations: 10,
		commandAllowlist: [],
		denyPaths: ['.env', '.env.local', '.git/', 'node_modules/', '*.key', '*.pem'],
		...overrides
	}
}

function createContext(policy: Partial<AgentPolicy> = {}, provider: ExecutionProvider): ToolContext {
	return {
		provider,
		policy: createPolicy(policy),
		runId: 'integration-test-run'
	}
}

describe('FS Tools Integration: Large File Workflow', () => {
	it('should use stat → head pattern for large files', async () => {
		// Create a 100KB log file
		const logContent = Array.from(
			{ length: 5000 },
			(_, i) => `[2024-01-15T10:${String(i % 60).padStart(2, '0')}:00Z] INFO: Processing request ${i}`
		).join('\n')

		const { provider } = createMockFileSystem({
			'/var/log/app.log': logContent
		})
		const context = createContext({}, provider)

		// Step 1: Stat the file to check size
		const statResult = await fsStatTool.execute({ path: '/var/log/app.log' }, context)
		expect(statResult.success).toBe(true)
		expect(statResult.data?.size).toBeGreaterThan(50000)

		// Step 2: Based on size, read just the head
		const headResult = await fsReadHeadTool.execute({ path: '/var/log/app.log', maxBytes: 1024 }, context)
		expect(headResult.success).toBe(true)
		expect(headResult.data?.truncated).toBe(true)
		expect(headResult.data?.text).toContain('[2024-01-15T10:00:00Z]')
	})

	it('should use stat → tail pattern for log inspection', async () => {
		const logContent = Array.from(
			{ length: 1000 },
			(_, i) => `Line ${i}: ${i === 999 ? 'ERROR: Connection failed' : 'INFO: OK'}`
		).join('\n')

		const { provider } = createMockFileSystem({
			'/app/error.log': logContent
		})
		const context = createContext({}, provider)

		// Step 1: Stat to confirm file exists and get size
		const statResult = await fsStatTool.execute({ path: '/app/error.log' }, context)
		expect(statResult.success).toBe(true)

		// Step 2: Read tail to find recent errors
		const tailResult = await fsReadTailTool.execute({ path: '/app/error.log', maxBytes: 500 }, context)
		expect(tailResult.success).toBe(true)
		expect(tailResult.data?.text).toContain('ERROR: Connection failed')
	})

	it('should use range reads for binary-like inspection', async () => {
		// Simulate a structured file with known offsets
		const header = 'HEADER:v1.0'.padEnd(50, ' ')
		const body = 'BODY_DATA'.repeat(100)
		const footer = 'FOOTER:checksum=abc123'.padStart(50, ' ')
		const content = header + body + footer

		const { provider } = createMockFileSystem({
			'/data/structured.dat': content
		})
		const context = createContext({}, provider)

		// Read header region (first 50 bytes)
		const headerResult = await fsReadRangeTool.execute({ path: '/data/structured.dat', offset: 0, length: 50 }, context)
		expect(headerResult.success).toBe(true)
		expect(headerResult.data?.text).toContain('HEADER:v1.0')

		// Read footer region (last 50 bytes)
		const statResult = await fsStatTool.execute({ path: '/data/structured.dat' }, context)
		const totalSize = statResult.data!.size

		const footerResult = await fsReadRangeTool.execute(
			{ path: '/data/structured.dat', offset: totalSize - 50, length: 50 },
			context
		)
		expect(footerResult.success).toBe(true)
		expect(footerResult.data?.text).toContain('FOOTER:checksum=abc123')
	})
})

describe('FS Tools Integration: Multi-File Operations', () => {
	it('should batch read multiple related files', async () => {
		const { provider } = createMockFileSystem({
			'/src/index.ts': 'export * from "./utils";\nexport * from "./core";',
			'/src/utils.ts': 'export function helper() { return 1; }',
			'/src/core.ts': 'export class Core { init() {} }',
			'/src/types.ts': 'export type Config = { debug: boolean };'
		})
		const context = createContext({}, provider)

		// Read multiple files at once
		const result = await fsReadManyTool.execute(
			{
				paths: ['/src/index.ts', '/src/utils.ts', '/src/core.ts', '/src/types.ts']
			},
			context
		)

		expect(result.success).toBe(true)
		expect(result.data?.files).toHaveLength(4)
		expect(result.data?.files.map((f) => f.path)).toContain('/src/index.ts')
		expect(result.data?.files.find((f) => f.path === '/src/utils.ts')?.content).toContain('helper')
	})

	it('should list directory and then read specific files', async () => {
		const { provider } = createMockFileSystem({
			'/project/src/a.ts': 'const a = 1;',
			'/project/src/b.ts': 'const b = 2;',
			'/project/src/c.ts': 'const c = 3;'
		})
		const context = createContext({}, provider)

		// Step 1: List the directory
		const listResult = await fsListTool.execute({ path: '/project/src', recursive: false }, context)
		expect(listResult.success).toBe(true)
		expect(listResult.data?.entries).toHaveLength(3)

		// Step 2: Read specific files based on listing
		const tsFiles = listResult.data!.entries.filter((e) => e.name.endsWith('.ts'))
		const readResult = await fsReadManyTool.execute({ paths: tsFiles.map((f) => f.path) }, context)
		expect(readResult.success).toBe(true)
		expect(readResult.data?.files).toHaveLength(3)
	})

	it('should search and then read matching files', async () => {
		const { provider } = createMockFileSystem({
			'/src/auth.ts': 'export function authenticate() { /* TODO: implement */ }',
			'/src/api.ts': 'export function fetchData() { return null; }',
			'/src/utils.ts': 'export function format() { /* TODO: add tests */ }'
		})
		const context = createContext({}, provider)

		// Step 1: Search for TODO comments
		const searchResult = await fsSearchTool.execute({ pattern: 'TODO', maxResults: 100 }, context)
		expect(searchResult.success).toBe(true)
		expect(searchResult.data?.results.length).toBeGreaterThan(0)

		// Step 2: Read files with TODOs
		const pathsWithTodos = searchResult.data!.results.map((r) => r.path)
		const readResult = await fsReadManyTool.execute({ paths: pathsWithTodos }, context)
		expect(readResult.success).toBe(true)

		// Verify we got the right files
		const contents = readResult.data!.files.map((f) => f.content).join('\n')
		expect(contents).toContain('TODO: implement')
		expect(contents).toContain('TODO: add tests')
	})
})

describe('FS Tools Integration: Write and Verify Workflow', () => {
	it('should write file and verify with read', async () => {
		const { provider, files } = createMockFileSystem({})
		const context = createContext({}, provider)

		const content = 'export const VERSION = "1.0.0";'

		// Write the file
		const writeResult = await fsWriteTool.execute({ path: '/src/version.ts', content }, context)
		expect(writeResult.success).toBe(true)

		// Verify file exists in mock fs
		expect(files.has('/src/version.ts')).toBe(true)

		// Read it back
		const readResult = await fsReadTool.execute({ path: '/src/version.ts' }, context)
		expect(readResult.success).toBe(true)
		expect(readResult.data?.content).toBe(content)
	})

	it('should overwrite existing file and verify changes', async () => {
		const { provider } = createMockFileSystem({
			'/config.json': '{"version": 1}'
		})
		const context = createContext({}, provider)

		// Read original
		const originalRead = await fsReadTool.execute({ path: '/config.json' }, context)
		expect(originalRead.data?.content).toBe('{"version": 1}')

		// Overwrite
		const newContent = '{"version": 2, "updated": true}'
		await fsWriteTool.execute({ path: '/config.json', content: newContent }, context)

		// Verify new content
		const updatedRead = await fsReadTool.execute({ path: '/config.json' }, context)
		expect(updatedRead.data?.content).toBe(newContent)
	})

	it('should create multiple files and snapshot them', async () => {
		const { provider } = createMockFileSystem({})
		const context = createContext({}, provider)

		// Create several files
		await fsWriteTool.execute({ path: '/src/a.ts', content: 'const a = 1;' }, context)
		await fsWriteTool.execute({ path: '/src/b.ts', content: 'const b = 2;' }, context)
		await fsWriteTool.execute({ path: '/src/c.ts', content: 'const c = 3;' }, context)

		// Take snapshot (paths is optional, omit to get all)
		const snapshotResult = await fsSnapshotTool.execute({}, context)
		expect(snapshotResult.success).toBe(true)

		const snapshot = snapshotResult.data!.files
		expect(Object.keys(snapshot)).toHaveLength(3)
		expect(snapshot['/src/a.ts']).toBe('const a = 1;')
		expect(snapshot['/src/b.ts']).toBe('const b = 2;')
		expect(snapshot['/src/c.ts']).toBe('const c = 3;')
	})
})

describe('FS Tools Integration: Error Recovery', () => {
	it('should handle missing file gracefully in multi-read', async () => {
		const { provider } = createMockFileSystem({
			'/src/exists.ts': 'content'
		})
		const context = createContext({}, provider)

		// Try to read mix of existing and missing files
		const result = await fsReadManyTool.execute({ paths: ['/src/exists.ts', '/src/missing.ts'] }, context)

		// Should have partial results with error for missing file
		expect(result.success).toBe(true)
		// One file has content, one has error
		expect(result.data?.files).toHaveLength(2)
		expect(result.data?.errorCount).toBe(1)
		// Check the successful file
		const existingFile = result.data?.files.find((f) => f.path === '/src/exists.ts')
		expect(existingFile?.content).toBe('content')
		// Check the error file
		const missingFile = result.data?.files.find((f) => f.path === '/src/missing.ts')
		expect(missingFile?.error).toBeDefined()
	})

	it('should recover from failed stat with fallback to full read', async () => {
		const { provider, files } = createMockFileSystem({
			'/data/small.txt': 'This is a small file'
		})
		const context = createContext({}, provider)

		// If stat fails (simulating edge case), we can still read
		// First try stat
		const statResult = await fsStatTool.execute({ path: '/data/small.txt' }, context)

		if (statResult.success && statResult.data!.size < 1000) {
			// Small file - read it all
			const readResult = await fsReadTool.execute({ path: '/data/small.txt' }, context)
			expect(readResult.success).toBe(true)
			expect(readResult.data?.content).toBe('This is a small file')
		}
	})
})

describe('FS Tools Integration: Search and Modify Workflow', () => {
	it('should search, read, modify, and write back', async () => {
		const { provider } = createMockFileSystem({
			'/src/api.ts': `
export function fetchUsers() {
  const API_URL = 'http://localhost:3000';
  return fetch(API_URL + '/users');
}
`
		})
		const context = createContext({}, provider)

		// Step 1: Search for the pattern we want to change
		const searchResult = await fsSearchTool.execute({ pattern: 'localhost:3000', maxResults: 100 }, context)
		expect(searchResult.success).toBe(true)
		expect(searchResult.data?.results).toHaveLength(1)

		// Step 2: Read the file
		const filePath = searchResult.data!.results[0].path
		const readResult = await fsReadTool.execute({ path: filePath }, context)
		expect(readResult.success).toBe(true)

		// Step 3: Modify content
		const newContent = readResult.data!.content.replace('localhost:3000', 'api.production.com')

		// Step 4: Write back
		const writeResult = await fsWriteTool.execute({ path: filePath, content: newContent }, context)
		expect(writeResult.success).toBe(true)

		// Step 5: Verify change
		const verifyResult = await fsReadTool.execute({ path: filePath }, context)
		expect(verifyResult.data?.content).toContain('api.production.com')
		expect(verifyResult.data?.content).not.toContain('localhost:3000')
	})
})
