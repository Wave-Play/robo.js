/**
 * Unit tests for deny-path enforcement in FS tools
 */

import { jest } from '@jest/globals'
import { fsReadTool } from '../../../src/tools/fs/read.js'
import { fsReadManyTool } from '../../../src/tools/fs/read-many.js'
import { fsWriteTool } from '../../../src/tools/fs/write.js'
import { fsListTool } from '../../../src/tools/fs/list.js'
import { fsSearchTool } from '../../../src/tools/fs/search.js'
import type { ToolContext } from '../../../src/tools/types.js'
import type { ExecutionProvider, AgentPolicy } from '../../../src/types/index.js'

// Create typed mock functions
type MockFn<T extends (...args: never[]) => unknown> = jest.Mock<T> & T

// Mock provider with correct interface
function createMockProvider(files: Record<string, string> = {}) {
	const readFileFn = jest.fn(async (path: string) => {
		if (files[path]) return files[path]
		throw new Error(`File not found: ${path}`)
	})
	const writeFileFn = jest.fn(async () => {})
	const readdirFn = jest.fn(async () => [] as Array<{ name: string; path: string; isDirectory: boolean }>)
	const searchFn = jest.fn(
		async () => [] as Array<{ path: string; matches?: Array<{ line: number; column: number; text: string }> }>
	)

	return {
		readFile: readFileFn,
		writeFile: writeFileFn,
		deletePath: jest.fn(async () => {}),
		exists: jest.fn(async (path: string) => path in files),
		readdir: readdirFn,
		mkdir: jest.fn(async () => {}),
		stat: jest.fn(async (path: string) => {
			if (files[path]) return { size: files[path].length, isDirectory: false }
			throw new Error(`File not found: ${path}`)
		}),
		search: searchFn,
		snapshot: jest.fn(async () => ({})),
		run: jest.fn(async () => ({ exitCode: 0, output: '' })),
		runStream: jest.fn(async function* () {}),
		startSession: jest.fn(async () => ({ sessionId: 'test', write: jest.fn() })),
		stopSession: jest.fn(async () => {}),
		streamSession: jest.fn(async function* () {})
	}
}

// Helper to create a valid policy with required fields
function createPolicy(overrides: Partial<AgentPolicy> = {}): AgentPolicy {
	return {
		autoApprove: false,
		maxIterations: 10,
		commandAllowlist: ['npm', 'node'],
		denyPaths: ['.env', '.env.local', '.git/', 'node_modules/', '*.key', '*.pem'],
		...overrides
	}
}

function createContext(
	policy: Partial<AgentPolicy> = {},
	provider?: ReturnType<typeof createMockProvider>
): ToolContext {
	return {
		provider: (provider ?? createMockProvider()) as unknown as ExecutionProvider,
		policy: createPolicy(policy),
		runId: 'test-run-id'
	}
}

describe('fs_read deny-path enforcement', () => {
	it('should deny reading .env files', async () => {
		const context = createContext()
		const result = await fsReadTool.execute({ path: '/.env' }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')
		expect(result.error).toContain('.env')
	})

	it('should deny reading .env.local files', async () => {
		const context = createContext()
		const result = await fsReadTool.execute({ path: '/config/.env.local' }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')
	})

	it('should deny reading .git directory contents', async () => {
		const context = createContext()
		const result = await fsReadTool.execute({ path: '/.git/config' }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')
	})

	it('should deny reading node_modules contents', async () => {
		const context = createContext()
		const result = await fsReadTool.execute({ path: '/node_modules/lodash/index.js' }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')
	})

	it('should deny reading key files', async () => {
		const context = createContext()
		const result = await fsReadTool.execute({ path: '/secrets/private.key' }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')
	})

	it('should allow reading non-denied files', async () => {
		const provider = createMockProvider({
			'/src/index.ts': 'export const foo = 1'
		})
		const context = createContext({}, provider)
		const result = await fsReadTool.execute({ path: '/src/index.ts' }, context)

		expect(result.success).toBe(true)
		expect(result.data?.content).toBe('export const foo = 1')
	})

	it('should handle case-insensitive matching', async () => {
		const context = createContext()
		const result = await fsReadTool.execute({ path: '/.ENV' }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')
	})
})

describe('fs_read_many deny-path enforcement', () => {
	it('should deny all paths if any are denied', async () => {
		const context = createContext()
		const result = await fsReadManyTool.execute({ paths: ['/src/index.ts', '/.env', '/package.json'] }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')
	})

	it('should allow all paths if none are denied', async () => {
		const provider = createMockProvider({
			'/src/index.ts': 'export const foo = 1',
			'/package.json': '{}'
		})
		const context = createContext({}, provider)
		const result = await fsReadManyTool.execute({ paths: ['/src/index.ts', '/package.json'] }, context)

		expect(result.success).toBe(true)
		expect(result.data?.files).toHaveLength(2)
	})
})

describe('fs_write deny-path enforcement', () => {
	it('should deny writing to .env files', async () => {
		const context = createContext()
		const result = await fsWriteTool.execute({ path: '/.env', content: 'SECRET=value' }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')
	})

	it('should deny writing to .git directory', async () => {
		const context = createContext()
		const result = await fsWriteTool.execute({ path: '/.git/config', content: 'malicious content' }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')
	})

	it('should allow writing to non-denied paths', async () => {
		const provider = createMockProvider()
		const context = createContext({}, provider)
		const result = await fsWriteTool.execute({ path: '/src/new-file.ts', content: 'export const x = 1' }, context)

		expect(result.success).toBe(true)
		expect(provider.writeFile).toHaveBeenCalledWith('/src/new-file.ts', 'export const x = 1')
	})
})

describe('fs_list deny-path enforcement', () => {
	it('should deny listing .git directory', async () => {
		const context = createContext()
		const result = await fsListTool.execute({ path: '/.git', recursive: false }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')
	})

	it('should deny listing node_modules', async () => {
		const context = createContext()
		const result = await fsListTool.execute({ path: '/node_modules', recursive: false }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')
	})

	it('should allow listing non-denied directories', async () => {
		const provider = createMockProvider()
		provider.readdir.mockResolvedValue([
			{ name: 'index.ts', path: '/src/index.ts', isDirectory: false },
			{ name: 'utils', path: '/src/utils', isDirectory: true }
		])
		const context = createContext({}, provider)
		const result = await fsListTool.execute({ path: '/src', recursive: false }, context)

		expect(result.success).toBe(true)
	})
})

describe('fs_search deny-path filtering', () => {
	it('should filter out denied paths from results', async () => {
		const provider = createMockProvider()
		provider.search.mockResolvedValue([
			{ path: '/src/config.ts', matches: [{ line: 1, column: 1, text: 'API_URL' }] },
			{ path: '/.env', matches: [{ line: 1, column: 1, text: 'API_KEY' }] },
			{ path: '/package.json', matches: [{ line: 1, column: 1, text: 'api' }] }
		])
		const context = createContext({}, provider)

		const result = await fsSearchTool.execute({ pattern: 'API', maxResults: 100 }, context)

		expect(result.success).toBe(true)
		// Should filter out .env from results
		const paths = result.data?.results.map((r) => r.path) ?? []
		expect(paths).not.toContain('/.env')
		expect(paths).toContain('/src/config.ts')
	})

	it('should not leak denied path contents in search results', async () => {
		const provider = createMockProvider()
		provider.search.mockResolvedValue([
			{ path: '/.git/config', matches: [{ line: 1, column: 1, text: 'sensitive' }] },
			{ path: '/secrets/private.key', matches: [{ line: 1, column: 1, text: 'key content' }] }
		])
		const context = createContext({}, provider)

		const result = await fsSearchTool.execute({ pattern: 'sensitive', maxResults: 100 }, context)

		expect(result.success).toBe(true)
		expect(result.data?.results).toHaveLength(0)
	})
})

describe('deny-path with empty policy', () => {
	it('should allow all paths if denyPaths is empty', async () => {
		const provider = createMockProvider({
			'/.env': 'SECRET=value'
		})
		const context = createContext({ denyPaths: [] }, provider)

		const result = await fsReadTool.execute({ path: '/.env' }, context)

		expect(result.success).toBe(true)
		expect(result.data?.content).toBe('SECRET=value')
	})
})
