/**
 * Integration tests for apply_changes tool workflow
 *
 * Tests the full atomic change application lifecycle including
 * validation, diff generation, approval flow, and rollback.
 */

import { jest } from '@jest/globals'
import { applyChangesTool } from '../../src/tools/changes/apply.js'
import { fsReadTool } from '../../src/tools/fs/read.js'
import { fsReadManyTool } from '../../src/tools/fs/read-many.js'
import type { ToolContext } from '../../src/tools/types.js'
import type { ExecutionProvider, AgentPolicy, FileChange, AgentEvent } from '../../src/types/index.js'

/**
 * Create a mock file system that tracks all operations
 */
function createMockFileSystem(initialFiles: Record<string, string> = {}): {
	provider: ExecutionProvider
	files: Map<string, string>
	writeLog: Array<{ path: string; content: string; timestamp: number }>
	deleteLog: Array<{ path: string; timestamp: number }>
} {
	const files = new Map<string, string>(Object.entries(initialFiles))
	const writeLog: Array<{ path: string; content: string; timestamp: number }> = []
	const deleteLog: Array<{ path: string; timestamp: number }> = []

	const provider: ExecutionProvider = {
		readFile: jest.fn(async (path: string) => {
			const content = files.get(path)
			if (content === undefined) {
				throw new Error(`ENOENT: no such file or directory, open '${path}'`)
			}
			return content
		}),

		writeFile: jest.fn(async (path: string, content: string) => {
			files.set(path, content)
			writeLog.push({ path, content, timestamp: Date.now() })
		}),

		deletePath: jest.fn(async (path: string) => {
			files.delete(path)
			deleteLog.push({ path, timestamp: Date.now() })
		}),

		stat: jest.fn(async (path: string) => {
			const content = files.get(path)
			if (content === undefined) {
				throw new Error(`ENOENT: no such file or directory, stat '${path}'`)
			}
			return { size: content.length, isDirectory: false }
		}),

		list: jest.fn(async () => []),
		search: jest.fn(async () => []),
		snapshot: jest.fn(async () => ({})),
		run: jest.fn(async () => ({ exitCode: 0, output: '' })),
		runStream: jest.fn(async function* () {})
	} as unknown as ExecutionProvider

	return { provider, files, writeLog, deleteLog }
}

function createContext(
	policy: Partial<AgentPolicy>,
	provider: ExecutionProvider,
	onEvent?: (event: AgentEvent) => void
): ToolContext {
	return {
		provider,
		policy: {
			autoApprove: true,
			maxIterations: 10,
			commandAllowlist: [],
			denyPaths: ['.env', '.git/'],
			...policy
		},
		runId: 'apply-changes-test',
		onEvent
	}
}

describe('Apply Changes Integration: Full Workflow', () => {
	it('should create, modify, and delete files in single transaction', async () => {
		const { provider, files } = createMockFileSystem({
			'/src/old.ts': 'old content',
			'/src/modify.ts': 'original content'
		})
		const context = createContext({ autoApprove: true }, provider)

		const changes: FileChange[] = [
			{ type: 'create', path: '/src/new.ts', content: 'new file content' },
			{ type: 'modify', path: '/src/modify.ts', content: 'modified content' },
			{ type: 'delete', path: '/src/old.ts' }
		]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(true)
		expect(result.data?.appliedPaths).toHaveLength(3)

		// Verify file system state
		expect(files.get('/src/new.ts')).toBe('new file content')
		expect(files.get('/src/modify.ts')).toBe('modified content')
		expect(files.has('/src/old.ts')).toBe(false)
	})

	it('should verify changes with subsequent reads', async () => {
		const { provider, files } = createMockFileSystem({})
		const context = createContext({ autoApprove: true }, provider)

		// Apply changes
		const changes: FileChange[] = [
			{ type: 'create', path: '/src/a.ts', content: 'const a = 1;' },
			{ type: 'create', path: '/src/b.ts', content: 'const b = 2;' },
			{ type: 'create', path: '/src/c.ts', content: 'const c = 3;' }
		]

		await applyChangesTool.execute({ changes }, context)

		// Verify with read tools
		const readResult = await fsReadManyTool.execute({ paths: ['/src/a.ts', '/src/b.ts', '/src/c.ts'] }, context)

		expect(readResult.success).toBe(true)
		expect(readResult.data?.files).toHaveLength(3)
		expect(readResult.data?.files.find((f) => f.path === '/src/a.ts')?.content).toBe('const a = 1;')
	})
})

describe('Apply Changes Integration: Atomicity Guarantees', () => {
	it('should not apply any changes if policy violation occurs', async () => {
		const { provider, files, writeLog } = createMockFileSystem({
			'/src/exists.ts': 'original'
		})
		const context = createContext({ denyPaths: ['.env'] }, provider)

		const changes: FileChange[] = [
			{ type: 'create', path: '/src/safe1.ts', content: 'safe' },
			{ type: 'create', path: '/.env', content: 'SECRET=value' }, // Denied!
			{ type: 'create', path: '/src/safe2.ts', content: 'safe' }
		]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('POLICY_VIOLATION')

		// No writes should have occurred
		expect(writeLog).toHaveLength(0)
		expect(files.has('/src/safe1.ts')).toBe(false)
		expect(files.has('/src/safe2.ts')).toBe(false)
	})

	it('should preserve original files on policy violation', async () => {
		const { provider, files } = createMockFileSystem({
			'/src/existing.ts': 'ORIGINAL CONTENT - MUST NOT CHANGE'
		})
		const context = createContext({ denyPaths: ['.git/'] }, provider)

		const changes: FileChange[] = [
			{ type: 'modify', path: '/src/existing.ts', content: 'modified' },
			{ type: 'create', path: '/.git/hooks/pre-commit', content: 'malicious' }
		]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(false)

		// Original file must be unchanged
		expect(files.get('/src/existing.ts')).toBe('ORIGINAL CONTENT - MUST NOT CHANGE')
	})

	it('should validate all changes before applying any', async () => {
		const { provider, writeLog } = createMockFileSystem({})
		const context = createContext({ denyPaths: ['*.key'] }, provider)

		// Many valid changes followed by one invalid
		const changes: FileChange[] = Array.from({ length: 10 }, (_, i) => ({
			type: 'create' as const,
			path: `/src/file${i}.ts`,
			content: `content ${i}`
		}))
		changes.push({ type: 'create', path: '/secrets/private.key', content: 'secret' })

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(false)
		// No files should have been written
		expect(writeLog).toHaveLength(0)
	})
})

describe('Apply Changes Integration: Approval Flow', () => {
	it('should generate diffs for approval when autoApprove is false', async () => {
		const { provider } = createMockFileSystem({
			'/src/file.ts': 'const x = 1;\nconst y = 2;\nconst z = 3;'
		})
		const context = createContext({ autoApprove: false }, provider)

		const changes: FileChange[] = [
			{ type: 'modify', path: '/src/file.ts', content: 'const x = 1;\nconst y = 42;\nconst z = 3;' }
		]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(false)
		expect(result.requiresApproval).toBe(true)
		expect(result.pendingChanges).toHaveLength(1)
		expect(result.pendingDiffs).toHaveLength(1)

		// Diff should contain the changes
		const diff = result.pendingDiffs![0]
		expect(diff.path).toBe('/src/file.ts')
		expect(diff.unifiedDiff).toContain('---')
		expect(diff.unifiedDiff).toContain('+++')
	})

	it('should apply changes directly when autoApprove is true', async () => {
		const { provider, files } = createMockFileSystem({})
		const context = createContext({ autoApprove: true }, provider)

		const changes: FileChange[] = [{ type: 'create', path: '/auto-approved.ts', content: 'content' }]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(true)
		expect(result.requiresApproval).toBeUndefined()
		expect(files.get('/auto-approved.ts')).toBe('content')
	})

	it('should include diff statistics', async () => {
		const { provider } = createMockFileSystem({
			'/file.ts': 'line1\nline2\nline3\nline4\nline5'
		})
		const context = createContext({ autoApprove: false }, provider)

		const changes: FileChange[] = [{ type: 'modify', path: '/file.ts', content: 'new1\nnew2\nnew3' }]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.pendingDiffs![0].additions).toBeDefined()
		expect(result.pendingDiffs![0].deletions).toBeDefined()
	})
})

describe('Apply Changes Integration: Event Emission', () => {
	it('should emit file_applied events for each change', async () => {
		const { provider } = createMockFileSystem({})
		const events: AgentEvent[] = []
		const context = createContext({ autoApprove: true }, provider, (e) => events.push(e))

		const changes: FileChange[] = [
			{ type: 'create', path: '/a.ts', content: 'a' },
			{ type: 'create', path: '/b.ts', content: 'b' },
			{ type: 'create', path: '/c.ts', content: 'c' }
		]

		await applyChangesTool.execute({ changes }, context)

		const fileAppliedEvents = events.filter((e) => e.type === 'file_applied')
		expect(fileAppliedEvents).toHaveLength(3)
		expect(fileAppliedEvents.map((e: any) => e.path)).toEqual(['/a.ts', '/b.ts', '/c.ts'])
	})

	it('should emit file_proposed event when approval required', async () => {
		const { provider } = createMockFileSystem({})
		const events: AgentEvent[] = []
		const context = createContext({ autoApprove: false }, provider, (e) => events.push(e))

		const changes: FileChange[] = [{ type: 'create', path: '/new.ts', content: 'content' }]

		await applyChangesTool.execute({ changes }, context)

		const proposedEvents = events.filter((e) => e.type === 'file_proposed')
		expect(proposedEvents).toHaveLength(1)
	})

	it('should not emit events on validation failure', async () => {
		const { provider } = createMockFileSystem({})
		const events: AgentEvent[] = []
		const context = createContext({ autoApprove: true, denyPaths: ['.env'] }, provider, (e) => events.push(e))

		const changes: FileChange[] = [{ type: 'create', path: '/.env', content: 'secret' }]

		await applyChangesTool.execute({ changes }, context)

		// No file_applied events should be emitted on policy failure
		expect(events.filter((e) => e.type === 'file_applied')).toHaveLength(0)
	})
})

describe('Apply Changes Integration: Edge Cases', () => {
	it('should handle modifying non-existent file as create', async () => {
		const { provider, files } = createMockFileSystem({})
		const context = createContext({ autoApprove: true }, provider)

		const changes: FileChange[] = [{ type: 'modify', path: '/nonexistent.ts', content: 'created via modify' }]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(true)
		expect(files.get('/nonexistent.ts')).toBe('created via modify')
	})

	it('should handle deleting non-existent file gracefully', async () => {
		const { provider, deleteLog } = createMockFileSystem({})
		const context = createContext({ autoApprove: true }, provider)

		const changes: FileChange[] = [{ type: 'delete', path: '/nonexistent.ts' }]

		const result = await applyChangesTool.execute({ changes }, context)

		// Should succeed (no-op)
		expect(result.success).toBe(true)
		// Should not attempt actual delete
		expect(deleteLog).toHaveLength(0)
	})

	it('should preserve applied order', async () => {
		const { provider, writeLog } = createMockFileSystem({})
		const context = createContext({ autoApprove: true }, provider)

		const changes: FileChange[] = [
			{ type: 'create', path: '/1.ts', content: '1' },
			{ type: 'create', path: '/2.ts', content: '2' },
			{ type: 'create', path: '/3.ts', content: '3' },
			{ type: 'create', path: '/4.ts', content: '4' },
			{ type: 'create', path: '/5.ts', content: '5' }
		]

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.data?.appliedPaths).toEqual(['/1.ts', '/2.ts', '/3.ts', '/4.ts', '/5.ts'])
		expect(writeLog.map((w) => w.path)).toEqual(['/1.ts', '/2.ts', '/3.ts', '/4.ts', '/5.ts'])
	})

	it('should handle large batch of changes', async () => {
		const { provider, files } = createMockFileSystem({})
		const context = createContext({ autoApprove: true }, provider)

		// Create 100 files
		const changes: FileChange[] = Array.from({ length: 100 }, (_, i) => ({
			type: 'create' as const,
			path: `/src/file${String(i).padStart(3, '0')}.ts`,
			content: `export const value${i} = ${i};`
		}))

		const result = await applyChangesTool.execute({ changes }, context)

		expect(result.success).toBe(true)
		expect(result.data?.appliedPaths).toHaveLength(100)
		expect(files.size).toBe(100)
	})
})

describe('Apply Changes Integration: Diff Quality', () => {
	it('should generate meaningful unified diff for modifications', async () => {
		const { provider } = createMockFileSystem({
			'/src/api.ts': `export function fetchData() {
  const url = 'http://localhost:3000';
  return fetch(url);
}`
		})
		const context = createContext({ autoApprove: false }, provider)

		const changes: FileChange[] = [
			{
				type: 'modify',
				path: '/src/api.ts',
				content: `export function fetchData() {
  const url = 'https://api.production.com';
  return fetch(url);
}`
			}
		]

		const result = await applyChangesTool.execute({ changes }, context)

		const diff = result.pendingDiffs![0]
		expect(diff.unifiedDiff).toContain('localhost:3000')
		expect(diff.unifiedDiff).toContain('api.production.com')
		expect(diff.unifiedDiff).toContain('-')
		expect(diff.unifiedDiff).toContain('+')
	})

	it('should show file creation as all additions', async () => {
		const { provider } = createMockFileSystem({})
		const context = createContext({ autoApprove: false }, provider)

		const changes: FileChange[] = [
			{
				type: 'create',
				path: '/new.ts',
				content: 'line1\nline2\nline3'
			}
		]

		const result = await applyChangesTool.execute({ changes }, context)

		const diff = result.pendingDiffs![0]
		expect(diff.type).toBe('create')
		expect(diff.additions).toBe(3)
		// All lines should be additions
		expect(diff.unifiedDiff!.match(/^\+/gm)?.length).toBeGreaterThanOrEqual(3)
	})

	it('should show file deletion as all deletions', async () => {
		const { provider } = createMockFileSystem({
			'/delete.ts': 'line1\nline2\nline3'
		})
		const context = createContext({ autoApprove: false }, provider)

		const changes: FileChange[] = [{ type: 'delete', path: '/delete.ts' }]

		const result = await applyChangesTool.execute({ changes }, context)

		const diff = result.pendingDiffs![0]
		expect(diff.type).toBe('delete')
		expect(diff.deletions).toBe(3)
		// All lines should be deletions
		expect(diff.unifiedDiff!.match(/^-/gm)?.length).toBeGreaterThanOrEqual(3)
	})
})
