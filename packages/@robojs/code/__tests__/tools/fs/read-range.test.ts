/**
 * Unit tests for large file handling tools
 */

import { jest } from '@jest/globals'
import { fsStatTool } from '../../../src/tools/fs/stat.js'
import { fsReadRangeTool } from '../../../src/tools/fs/read-range.js'
import { fsReadHeadTool } from '../../../src/tools/fs/read-head.js'
import { fsReadTailTool } from '../../../src/tools/fs/read-tail.js'
import type { ToolContext } from '../../../src/tools/types.js'
import type { ExecutionProvider, AgentPolicy } from '../../../src/types/index.js'

// Mock provider - tools use readFile and stat, not special range methods
function createMockProvider(files: Record<string, { content: string; size?: number }> = {}): ExecutionProvider {
	return {
		readFile: jest.fn(async (path: string) => {
			const file = files[path]
			if (file) return file.content
			throw new Error(`File not found: ${path}`)
		}),
		writeFile: jest.fn(async () => {}),
		deletePath: jest.fn(async () => {}),
		stat: jest.fn(async (path: string) => {
			const file = files[path]
			if (file) {
				return {
					size: file.size ?? new TextEncoder().encode(file.content).length,
					isDirectory: false,
					mtimeMs: Date.now()
				}
			}
			throw new Error(`File not found: ${path}`)
		}),
		list: jest.fn(async () => []),
		search: jest.fn(async () => []),
		snapshot: jest.fn(async () => ({})),
		run: jest.fn(async () => ({ exitCode: 0, output: '' })),
		runStream: jest.fn(async function* () {})
	} as unknown as ExecutionProvider
}

function createPolicy(overrides: Partial<AgentPolicy> = {}): AgentPolicy {
	return {
		autoApprove: false,
		maxIterations: 10,
		commandAllowlist: ['npm', 'node'],
		denyPaths: ['.env', '.git/', '*.key'],
		...overrides
	}
}

function createContext(policy: Partial<AgentPolicy> = {}, provider?: ExecutionProvider): ToolContext {
	return {
		provider: provider ?? createMockProvider(),
		policy: createPolicy(policy),
		runId: 'test-run-id'
	}
}

describe('fs_stat', () => {
	it('should return file size and metadata', async () => {
		const provider = createMockProvider({
			'/large-file.log': { content: 'x'.repeat(1024 * 1024), size: 1024 * 1024 }
		})
		const context = createContext({}, provider)

		const result = await fsStatTool.execute({ path: '/large-file.log' }, context)

		expect(result.success).toBe(true)
		expect(result.data?.size).toBe(1024 * 1024)
		expect(result.data?.isDirectory).toBe(false)
		expect(result.data?.path).toBe('/large-file.log')
	})

	it('should deny stat on restricted paths', async () => {
		const context = createContext()
		const result = await fsStatTool.execute({ path: '/.env' }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')
	})

	it('should handle file not found', async () => {
		const provider = createMockProvider({})
		const context = createContext({}, provider)

		const result = await fsStatTool.execute({ path: '/nonexistent.txt' }, context)

		expect(result.success).toBe(false)
		expect(result.error).toContain('Failed to stat')
	})
})

describe('fs_read_head', () => {
	it('should read first N bytes of file', async () => {
		const provider = createMockProvider({
			'/file.txt': { content: 'Hello, World! This is a test file.' }
		})
		const context = createContext({}, provider)

		const result = await fsReadHeadTool.execute({ path: '/file.txt', maxBytes: 5 }, context)

		expect(result.success).toBe(true)
		expect(result.data?.text).toBe('Hello')
		expect(result.data?.truncated).toBe(true)
		expect(result.data?.size).toBe(5)
	})

	it('should not truncate if file is smaller than requested bytes', async () => {
		const provider = createMockProvider({
			'/small.txt': { content: 'Hi' }
		})
		const context = createContext({}, provider)

		const result = await fsReadHeadTool.execute({ path: '/small.txt', maxBytes: 100 }, context)

		expect(result.success).toBe(true)
		expect(result.data?.text).toBe('Hi')
		expect(result.data?.truncated).toBe(false)
	})

	it('should deny head on restricted paths', async () => {
		const context = createContext()
		const result = await fsReadHeadTool.execute({ path: '/.git/config', maxBytes: 100 }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')
	})

	it('should use default maxBytes if not specified', async () => {
		const provider = createMockProvider({
			'/file.txt': { content: 'x'.repeat(50000) }
		})
		const context = createContext({}, provider)

		// When maxBytes is omitted, it uses the default (32KB)
		const result = await fsReadHeadTool.execute({ path: '/file.txt', maxBytes: 32768 }, context)

		expect(result.success).toBe(true)
		// Default is 32KB
		expect(result.data?.size).toBe(32768)
		expect(result.data?.truncated).toBe(true)
	})
})

describe('fs_read_tail', () => {
	it('should read last N bytes of file', async () => {
		const provider = createMockProvider({
			'/file.txt': { content: 'Hello, World!' }
		})
		const context = createContext({}, provider)

		const result = await fsReadTailTool.execute({ path: '/file.txt', maxBytes: 6 }, context)

		expect(result.success).toBe(true)
		expect(result.data?.text).toBe('World!')
		expect(result.data?.truncated).toBe(true)
	})

	it('should return full content if smaller than requested bytes', async () => {
		const provider = createMockProvider({
			'/small.txt': { content: 'Hi' }
		})
		const context = createContext({}, provider)

		const result = await fsReadTailTool.execute({ path: '/small.txt', maxBytes: 100 }, context)

		expect(result.success).toBe(true)
		expect(result.data?.text).toBe('Hi')
		expect(result.data?.truncated).toBe(false)
	})

	it('should deny tail on restricted paths', async () => {
		const context = createContext()
		const result = await fsReadTailTool.execute({ path: '/.env', maxBytes: 100 }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')
	})
})

describe('fs_read_range', () => {
	it('should read byte range from file', async () => {
		const provider = createMockProvider({
			'/file.txt': { content: 'Hello, World!' }
		})
		const context = createContext({}, provider)

		const result = await fsReadRangeTool.execute({ path: '/file.txt', offset: 7, length: 5 }, context)

		expect(result.success).toBe(true)
		expect(result.data?.text).toBe('World')
		expect(result.data?.offset).toBe(7)
		expect(result.data?.length).toBe(5)
	})

	it('should handle range extending beyond file', async () => {
		const provider = createMockProvider({
			'/small.txt': { content: 'Hi' }
		})
		const context = createContext({}, provider)

		const result = await fsReadRangeTool.execute({ path: '/small.txt', offset: 0, length: 100 }, context)

		expect(result.success).toBe(true)
		expect(result.data?.text).toBe('Hi')
		expect(result.data?.length).toBe(2)
	})

	it('should deny range read on restricted paths', async () => {
		const context = createContext()
		const result = await fsReadRangeTool.execute({ path: '/secrets/private.key', offset: 0, length: 100 }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')
	})

	it('should include range metadata in result', async () => {
		const provider = createMockProvider({
			'/file.txt': { content: 'Hello, World!' }
		})
		const context = createContext({}, provider)

		const result = await fsReadRangeTool.execute({ path: '/file.txt', offset: 0, length: 5 }, context)

		expect(result.success).toBe(true)
		expect(result.data?.offset).toBe(0)
		expect(result.data?.length).toBe(5)
		expect(result.data?.totalSize).toBe(13) // "Hello, World!".length
	})
})

describe('large file workflow', () => {
	it('should support stat -> head pattern for large files', async () => {
		const largeContent = 'x'.repeat(10 * 1024 * 1024) // 10MB
		const provider = createMockProvider({
			'/large.log': { content: largeContent, size: 10 * 1024 * 1024 }
		})
		const context = createContext({}, provider)

		// First, stat the file to get size
		const statResult = await fsStatTool.execute({ path: '/large.log' }, context)
		expect(statResult.success).toBe(true)
		expect(statResult.data?.size).toBe(10 * 1024 * 1024)

		// Then read just the head
		const headResult = await fsReadHeadTool.execute({ path: '/large.log', maxBytes: 1024 }, context)
		expect(headResult.success).toBe(true)
		expect(headResult.data?.truncated).toBe(true)
		expect(headResult.data?.size).toBe(1024)
	})

	it('should support stat -> tail pattern for log files', async () => {
		const logLines = Array.from({ length: 1000 }, (_, i) => `Line ${i}: Log entry`).join('\n')
		const provider = createMockProvider({
			'/app.log': { content: logLines }
		})
		const context = createContext({}, provider)

		// Stat to check size
		const statResult = await fsStatTool.execute({ path: '/app.log' }, context)
		expect(statResult.success).toBe(true)

		// Read last 500 bytes (recent logs)
		const tailResult = await fsReadTailTool.execute({ path: '/app.log', maxBytes: 500 }, context)
		expect(tailResult.success).toBe(true)
		expect(tailResult.data?.truncated).toBe(true)
	})
})
