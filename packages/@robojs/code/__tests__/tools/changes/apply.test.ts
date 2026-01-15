/**
 * Unit tests for apply_changes tool - atomic file changes
 */

import { jest } from '@jest/globals'
import { applyChangesTool } from '../../../src/tools/changes/apply.js'
import type { ToolContext } from '../../../src/tools/types.js'
import type { ExecutionProvider, AgentPolicy, FileChange } from '../../../src/types/index.js'

// Track mock state
interface MockFileSystem {
	files: Record<string, string>
	deleted: Set<string>
	writeOrder: string[]
}

function createMockProvider(initialFiles: Record<string, string> = {}): {
	provider: ExecutionProvider
	fs: MockFileSystem
} {
	const fs: MockFileSystem = {
		files: { ...initialFiles },
		deleted: new Set(),
		writeOrder: []
	}

	const provider = {
		readFile: jest.fn(async (path: string) => {
			if (fs.deleted.has(path)) throw new Error(`File not found: ${path}`)
			if (fs.files[path] !== undefined) return fs.files[path]
			throw new Error(`File not found: ${path}`)
		}),
		writeFile: jest.fn(async (path: string, content: string) => {
			fs.files[path] = content
			fs.deleted.delete(path)
			fs.writeOrder.push(path)
		}),
		deletePath: jest.fn(async (path: string) => {
			delete fs.files[path]
			fs.deleted.add(path)
		}),
		stat: jest.fn(async (path: string) => {
			if (fs.deleted.has(path)) throw new Error(`File not found: ${path}`)
			if (fs.files[path] !== undefined) {
				return { size: fs.files[path].length, isDirectory: false }
			}
			throw new Error(`File not found: ${path}`)
		}),
		list: jest.fn(async () => []),
		search: jest.fn(async () => []),
		snapshot: jest.fn(async () => ({})),
		run: jest.fn(async () => ({ exitCode: 0, output: '' })),
		runStream: jest.fn(async function* () {})
	} as unknown as ExecutionProvider

	return { provider, fs }
}

function createPolicy(overrides: Partial<AgentPolicy> = {}): AgentPolicy {
	return {
		autoApprove: true, // Default to auto-approve for testing
		maxIterations: 10,
		commandAllowlist: [],
		denyPaths: ['.env', '.git/'],
		...overrides
	}
}

function createContext(policy: Partial<AgentPolicy> = {}, provider?: ExecutionProvider): ToolContext {
	return {
		provider: provider ?? createMockProvider().provider,
		policy: createPolicy(policy),
		runId: 'test-run-id'
	}
}

describe('apply_changes basic operations', () => {
	it('should create new files', async () => {
		const { provider, fs } = createMockProvider({})
		const context = createContext({ autoApprove: true }, provider)

		const changes: FileChange[] = [{ type: 'create', path: '/new-file.ts', content: 'export const x = 1' }]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(true)
		expect(fs.files['/new-file.ts']).toBe('export const x = 1')
		expect(result.data?.appliedPaths).toContain('/new-file.ts')
	})

	it('should modify existing files', async () => {
		const { provider, fs } = createMockProvider({
			'/existing.ts': 'const old = 1'
		})
		const context = createContext({ autoApprove: true }, provider)

		const changes: FileChange[] = [{ type: 'modify', path: '/existing.ts', content: 'const updated = 2' }]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(true)
		expect(fs.files['/existing.ts']).toBe('const updated = 2')
	})

	it('should delete files', async () => {
		const { provider, fs } = createMockProvider({
			'/to-delete.ts': 'content'
		})
		const context = createContext({ autoApprove: true }, provider)

		const changes: FileChange[] = [{ type: 'delete', path: '/to-delete.ts' }]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(true)
		expect(fs.files['/to-delete.ts']).toBeUndefined()
		expect(fs.deleted.has('/to-delete.ts')).toBe(true)
	})

	it('should apply multiple changes atomically', async () => {
		const { provider, fs } = createMockProvider({
			'/modify.ts': 'old content',
			'/delete.ts': 'to be deleted'
		})
		const context = createContext({ autoApprove: true }, provider)

		const changes: FileChange[] = [
			{ type: 'create', path: '/new.ts', content: 'new file' },
			{ type: 'modify', path: '/modify.ts', content: 'modified' },
			{ type: 'delete', path: '/delete.ts' }
		]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(true)
		expect(result.data?.appliedPaths).toHaveLength(3)
		expect(fs.files['/new.ts']).toBe('new file')
		expect(fs.files['/modify.ts']).toBe('modified')
		expect(fs.files['/delete.ts']).toBeUndefined()
	})
})

describe('apply_changes atomicity', () => {
	it('should reject entire change set if any path is denied', async () => {
		const { provider, fs } = createMockProvider({})
		const context = createContext({ denyPaths: ['.env'] }, provider)

		const changes: FileChange[] = [
			{ type: 'create', path: '/safe.ts', content: 'safe' },
			{ type: 'create', path: '/.env', content: 'SECRET=value' },
			{ type: 'create', path: '/another.ts', content: 'another' }
		]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')
		// No files should have been created
		expect(fs.files['/safe.ts']).toBeUndefined()
		expect(fs.files['/.env']).toBeUndefined()
		expect(fs.files['/another.ts']).toBeUndefined()
	})

	it('should not partially apply changes', async () => {
		// Changes that would fail validation should result in no changes at all
		const { provider, fs } = createMockProvider({
			'/existing.ts': 'original'
		})
		const context = createContext({ denyPaths: ['.git/'] }, provider)

		const changes: FileChange[] = [
			{ type: 'modify', path: '/existing.ts', content: 'modified' },
			{ type: 'create', path: '/.git/hooks/pre-commit', content: 'malicious' }
		]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(false)
		// Original file should be unchanged
		expect(fs.files['/existing.ts']).toBe('original')
	})
})

describe('apply_changes approval workflow', () => {
	it('should require approval when autoApprove is false', async () => {
		const { provider } = createMockProvider({})
		const context = createContext({ autoApprove: false }, provider)

		const changes: FileChange[] = [{ type: 'create', path: '/file.ts', content: 'content' }]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(false)
		expect(result.requiresApproval).toBe(true)
	})

	it('should generate diff for approval', async () => {
		const { provider } = createMockProvider({
			'/existing.ts': 'const x = 1'
		})
		const context = createContext({ autoApprove: false }, provider)

		const changes: FileChange[] = [{ type: 'modify', path: '/existing.ts', content: 'const x = 2' }]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.requiresApproval).toBe(true)
		expect(result.approvalReason).toBeDefined()
		// The diff should be in pendingDiffs
		expect(result.pendingDiffs).toBeDefined()
		expect(result.pendingDiffs?.[0]?.path).toBe('/existing.ts')
		expect(result.pendingDiffs?.[0]?.unifiedDiff).toContain('const x = 1')
	})

	it('should apply changes when autoApprove is true', async () => {
		const { provider, fs } = createMockProvider({})
		const context = createContext({ autoApprove: true }, provider)

		const changes: FileChange[] = [{ type: 'create', path: '/approved.ts', content: 'content' }]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(true)
		expect(fs.files['/approved.ts']).toBe('content')
	})
})

describe('apply_changes diff generation', () => {
	it('should generate unified diff for modifications', async () => {
		const { provider } = createMockProvider({
			'/file.ts': 'line1\nline2\nline3'
		})
		const context = createContext({ autoApprove: false }, provider)

		const changes: FileChange[] = [{ type: 'modify', path: '/file.ts', content: 'line1\nmodified\nline3' }]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.pendingDiffs).toBeDefined()
		expect(result.pendingDiffs?.[0]?.unifiedDiff).toContain('---')
		expect(result.pendingDiffs?.[0]?.unifiedDiff).toContain('+++')
	})

	it('should show file creation in diff', async () => {
		const { provider } = createMockProvider({})
		const context = createContext({ autoApprove: false }, provider)

		const changes: FileChange[] = [{ type: 'create', path: '/new.ts', content: 'new content' }]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.pendingDiffs).toBeDefined()
		expect(result.pendingDiffs?.[0]?.unifiedDiff).toContain('new.ts')
		expect(result.pendingDiffs?.[0]?.unifiedDiff).toContain('+')
	})

	it('should show file deletion in diff', async () => {
		const { provider } = createMockProvider({
			'/delete.ts': 'content to delete'
		})
		const context = createContext({ autoApprove: false }, provider)

		const changes: FileChange[] = [{ type: 'delete', path: '/delete.ts' }]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.pendingDiffs).toBeDefined()
		expect(result.pendingDiffs?.[0]?.unifiedDiff).toContain('delete.ts')
		expect(result.pendingDiffs?.[0]?.unifiedDiff).toContain('-')
	})
})

describe('apply_changes edge cases', () => {
	it('should reject empty change set', async () => {
		const { provider } = createMockProvider({})
		const context = createContext({ autoApprove: true }, provider)

		const result = await applyChangesTool.execute({ changes: [] }, context)

		// Tool rejects empty changes with error
		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('INVALID_ARGS')
	})

	it('should handle modifying non-existent file as create', async () => {
		const { provider, fs } = createMockProvider({})
		const context = createContext({ autoApprove: true }, provider)

		// Modify a file that doesn't exist should work (creates it)
		const changes: FileChange[] = [{ type: 'modify', path: '/nonexistent.ts', content: 'created' }]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(true)
		expect(fs.files['/nonexistent.ts']).toBe('created')
	})

	it('should handle deleting non-existent file gracefully', async () => {
		const { provider } = createMockProvider({})
		const context = createContext({ autoApprove: true }, provider)

		const changes: FileChange[] = [{ type: 'delete', path: '/nonexistent.ts' }]

		const result = await applyChangesTool.execute({ changes }, context)

		// Should succeed (no-op for non-existent file)
		expect(result.success).toBe(true)
	})

	it('should preserve file order in appliedPaths', async () => {
		const { provider } = createMockProvider({})
		const context = createContext({ autoApprove: true }, provider)

		const changes: FileChange[] = [
			{ type: 'create', path: '/a.ts', content: 'a' },
			{ type: 'create', path: '/b.ts', content: 'b' },
			{ type: 'create', path: '/c.ts', content: 'c' }
		]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.data?.appliedPaths).toEqual(['/a.ts', '/b.ts', '/c.ts'])
	})
})

describe('apply_changes event emission', () => {
	it('should emit file_applied events', async () => {
		const { provider } = createMockProvider({})
		const events: unknown[] = []
		const context: ToolContext = {
			...createContext({ autoApprove: true }, provider),
			onEvent: (event) => events.push(event)
		}

		const changes: FileChange[] = [
			{ type: 'create', path: '/file1.ts', content: 'content1' },
			{ type: 'create', path: '/file2.ts', content: 'content2' }
		]

		await applyChangesTool.execute({ changes }, context)

		const fileAppliedEvents = events.filter((e: any) => e.type === 'file_applied')
		expect(fileAppliedEvents).toHaveLength(2)
	})

	it('should emit file_proposed events when approval required', async () => {
		const { provider } = createMockProvider({})
		const events: unknown[] = []
		const context: ToolContext = {
			...createContext({ autoApprove: false }, provider),
			onEvent: (event) => events.push(event)
		}

		const changes: FileChange[] = [{ type: 'create', path: '/file.ts', content: 'content' }]

		await applyChangesTool.execute({ changes }, context)

		const fileProposedEvents = events.filter((e: any) => e.type === 'file_proposed')
		expect(fileProposedEvents).toHaveLength(1)
	})
})
