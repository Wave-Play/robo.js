/**
 * Integration tests for stale detection in fs_write and apply_changes
 */

import { jest } from '@jest/globals'
import { fsReadTool } from '../../../src/tools/fs/read.js'
import { fsReadManyTool } from '../../../src/tools/fs/read-many.js'
import { fsReadHeadTool } from '../../../src/tools/fs/read-head.js'
import { fsReadTailTool } from '../../../src/tools/fs/read-tail.js'
import { fsReadRangeTool } from '../../../src/tools/fs/read-range.js'
import { fsWriteTool } from '../../../src/tools/fs/write.js'
import { applyChangesTool } from '../../../src/tools/changes/apply.js'
import { FileReadTracker } from '../../../src/tools/tracking/file-tracker.js'
import type { ToolContext } from '../../../src/tools/types.js'
import type { ExecutionProvider, AgentPolicy } from '../../../src/types/index.js'

// Mock provider with mtime tracking
interface MockFileData {
	content: string
	mtimeMs: number
}

function createMockProvider(initialFiles: Record<string, string> = {}): {
	provider: ExecutionProvider
	files: Map<string, MockFileData>
	updateFile: (path: string, content: string) => void
	deleteFile: (path: string) => void
	createFile: (path: string, content: string) => void
} {
	const files = new Map<string, MockFileData>()
	const now = Date.now()

	// Initialize files with mtimes
	for (const [path, content] of Object.entries(initialFiles)) {
		files.set(path, { content, mtimeMs: now })
	}

	const provider: ExecutionProvider = {
		readFile: jest.fn(async (path: string) => {
			const file = files.get(path)
			if (file) return file.content
			throw new Error(`File not found: ${path}`)
		}),
		writeFile: jest.fn(async (path: string, content: string) => {
			files.set(path, { content, mtimeMs: Date.now() })
		}),
		deletePath: jest.fn(async (path: string) => {
			files.delete(path)
		}),
		exists: jest.fn(async (path: string) => {
			return files.has(path)
		}),
		stat: jest.fn(async (path: string) => {
			const file = files.get(path)
			if (file) {
				return {
					size: new TextEncoder().encode(file.content).length,
					isDirectory: false,
					mtimeMs: file.mtimeMs
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

	return {
		provider,
		files,
		updateFile: (path: string, content: string) => {
			files.set(path, { content, mtimeMs: Date.now() + 1000 }) // Bump mtime
		},
		deleteFile: (path: string) => {
			files.delete(path)
		},
		createFile: (path: string, content: string) => {
			files.set(path, { content, mtimeMs: Date.now() })
		}
	}
}

function createPolicy(overrides: Partial<AgentPolicy> = {}): AgentPolicy {
	return {
		autoApprove: true, // Auto-approve for tests
		maxIterations: 10,
		commandAllowlist: [],
		denyPaths: ['.env', '.git/'],
		...overrides
	}
}

function createContext(
	provider: ExecutionProvider,
	fileTracker?: FileReadTracker,
	policy: Partial<AgentPolicy> = {}
): ToolContext {
	return {
		provider,
		policy: createPolicy(policy),
		runId: 'test-run-id',
		fileTracker
	}
}

describe('fs_write stale detection', () => {
	it('should allow write when file unchanged since read', async () => {
		const { provider } = createMockProvider({
			'/src/app.ts': 'original content'
		})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		// Read the file
		const readResult = await fsReadTool.execute({ path: '/src/app.ts' }, context)
		expect(readResult.success).toBe(true)
		expect(tracker.hasRead('/src/app.ts')).toBe(true)

		// Write immediately (no external changes)
		const writeResult = await fsWriteTool.execute({ path: '/src/app.ts', content: 'new content' }, context)
		expect(writeResult.success).toBe(true)
	})

	it('should detect stale file when mtime changed', async () => {
		const { provider, updateFile } = createMockProvider({
			'/src/app.ts': 'original content'
		})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		// Read the file
		await fsReadTool.execute({ path: '/src/app.ts' }, context)

		// Simulate external modification
		updateFile('/src/app.ts', 'externally modified content')

		// Try to write - should detect staleness
		const writeResult = await fsWriteTool.execute({ path: '/src/app.ts', content: 'my changes' }, context)

		expect(writeResult.success).toBe(false)
		expect(writeResult.errorCode).toBe('STALE_FILE')
		expect(writeResult.recoverable).toBe(true)
		expect(writeResult.error).toContain('has changed since last read')
		expect(writeResult.error).toContain('mtime_changed')
	})

	it('should detect stale file when size changed', async () => {
		const { provider, files } = createMockProvider({
			'/src/app.ts': 'original'
		})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		// Read the file
		await fsReadTool.execute({ path: '/src/app.ts' }, context)

		// Simulate external modification with different size but same mtime
		const file = files.get('/src/app.ts')!
		files.set('/src/app.ts', {
			content: 'much longer content than before',
			mtimeMs: file.mtimeMs // Keep same mtime
		})

		// Try to write - should detect staleness via size
		const writeResult = await fsWriteTool.execute({ path: '/src/app.ts', content: 'my changes' }, context)

		expect(writeResult.success).toBe(false)
		expect(writeResult.errorCode).toBe('STALE_FILE')
		expect(writeResult.error).toContain('size_changed')
	})

	it('should allow write to new file without prior read', async () => {
		const { provider } = createMockProvider({})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		// Write without reading first
		const writeResult = await fsWriteTool.execute({ path: '/src/new.ts', content: 'new file content' }, context)

		expect(writeResult.success).toBe(true)
		expect(writeResult.data?.created).toBe(true)
	})

	it('should allow write after re-reading stale file', async () => {
		const { provider, updateFile } = createMockProvider({
			'/src/app.ts': 'original content'
		})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		// Read the file
		await fsReadTool.execute({ path: '/src/app.ts' }, context)

		// Simulate external modification
		updateFile('/src/app.ts', 'externally modified content')

		// First write attempt fails
		const writeResult1 = await fsWriteTool.execute({ path: '/src/app.ts', content: 'my changes' }, context)
		expect(writeResult1.success).toBe(false)
		expect(writeResult1.errorCode).toBe('STALE_FILE')

		// Re-read the file
		await fsReadTool.execute({ path: '/src/app.ts' }, context)

		// Second write should succeed
		const writeResult2 = await fsWriteTool.execute(
			{ path: '/src/app.ts', content: 'my changes after re-read' },
			context
		)
		expect(writeResult2.success).toBe(true)
	})

	it('should clear tracking after successful write', async () => {
		const { provider } = createMockProvider({
			'/src/app.ts': 'original content'
		})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		// Read the file
		await fsReadTool.execute({ path: '/src/app.ts' }, context)
		expect(tracker.hasRead('/src/app.ts')).toBe(true)

		// Write successfully
		await fsWriteTool.execute({ path: '/src/app.ts', content: 'new content' }, context)

		// Tracker should be cleared for this path
		expect(tracker.hasRead('/src/app.ts')).toBe(false)
	})

	it('should return STALE_FILE error code with recoverable=true', async () => {
		const { provider, updateFile } = createMockProvider({
			'/src/app.ts': 'original'
		})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		await fsReadTool.execute({ path: '/src/app.ts' }, context)
		updateFile('/src/app.ts', 'modified')

		const result = await fsWriteTool.execute({ path: '/src/app.ts', content: 'attempt' }, context)

		expect(result.errorCode).toBe('STALE_FILE')
		expect(result.recoverable).toBe(true)
	})

	it('should work without fileTracker (backward compatibility)', async () => {
		const { provider } = createMockProvider({
			'/src/app.ts': 'original'
		})
		// No fileTracker
		const context = createContext(provider, undefined)

		const result = await fsWriteTool.execute({ path: '/src/app.ts', content: 'new content' }, context)

		expect(result.success).toBe(true)
	})

	it('should detect file created externally after read miss', async () => {
		const { provider, createFile } = createMockProvider({})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		// Try to read non-existent file
		const readResult = await fsReadTool.execute({ path: '/src/new.ts' }, context)
		expect(readResult.success).toBe(false)
		// The file should be tracked as non-existent
		expect(tracker.hasRead('/src/new.ts')).toBe(true)
		expect(tracker.get('/src/new.ts')?.exists).toBe(false)

		// Externally create the file
		createFile('/src/new.ts', 'created externally')

		// Try to write - should detect file was created
		const writeResult = await fsWriteTool.execute({ path: '/src/new.ts', content: 'my content' }, context)

		expect(writeResult.success).toBe(false)
		expect(writeResult.errorCode).toBe('STALE_FILE')
		expect(writeResult.error).toContain('file_created')
	})

	it('should detect file deleted after read', async () => {
		const { provider, deleteFile } = createMockProvider({
			'/src/app.ts': 'original content'
		})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		// Read the file
		await fsReadTool.execute({ path: '/src/app.ts' }, context)

		// Externally delete the file
		deleteFile('/src/app.ts')

		// Try to write - should detect file was deleted
		const writeResult = await fsWriteTool.execute({ path: '/src/app.ts', content: 'my content' }, context)

		expect(writeResult.success).toBe(false)
		expect(writeResult.errorCode).toBe('STALE_FILE')
		expect(writeResult.error).toContain('file_deleted')
	})
})

describe('other read tools snapshot recording', () => {
	it('fs_read_many should record snapshots for all files', async () => {
		const { provider, updateFile } = createMockProvider({
			'/src/a.ts': 'content a',
			'/src/b.ts': 'content b'
		})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		// Read multiple files
		await fsReadManyTool.execute({ paths: ['/src/a.ts', '/src/b.ts'] }, context)

		// Both should be tracked
		expect(tracker.hasRead('/src/a.ts')).toBe(true)
		expect(tracker.hasRead('/src/b.ts')).toBe(true)

		// Modify one externally
		updateFile('/src/a.ts', 'modified')

		// Write should detect staleness
		const writeResult = await fsWriteTool.execute({ path: '/src/a.ts', content: 'my changes' }, context)
		expect(writeResult.success).toBe(false)
		expect(writeResult.errorCode).toBe('STALE_FILE')
	})

	it('fs_read_head should record snapshot', async () => {
		const { provider, updateFile } = createMockProvider({
			'/src/app.ts': 'original content that is fairly long'
		})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		// Read head of file
		await fsReadHeadTool.execute({ path: '/src/app.ts', maxBytes: 10 }, context)
		expect(tracker.hasRead('/src/app.ts')).toBe(true)

		// Modify externally
		updateFile('/src/app.ts', 'modified')

		// Write should detect staleness
		const writeResult = await fsWriteTool.execute({ path: '/src/app.ts', content: 'new' }, context)
		expect(writeResult.success).toBe(false)
		expect(writeResult.errorCode).toBe('STALE_FILE')
	})

	it('fs_read_tail should record snapshot', async () => {
		const { provider, updateFile } = createMockProvider({
			'/src/app.ts': 'original content that is fairly long'
		})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		// Read tail of file
		await fsReadTailTool.execute({ path: '/src/app.ts', maxBytes: 10 }, context)
		expect(tracker.hasRead('/src/app.ts')).toBe(true)

		// Modify externally
		updateFile('/src/app.ts', 'modified')

		// Write should detect staleness
		const writeResult = await fsWriteTool.execute({ path: '/src/app.ts', content: 'new' }, context)
		expect(writeResult.success).toBe(false)
		expect(writeResult.errorCode).toBe('STALE_FILE')
	})

	it('fs_read_range should record snapshot', async () => {
		const { provider, updateFile } = createMockProvider({
			'/src/app.ts': 'original content that is fairly long'
		})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		// Read range of file
		await fsReadRangeTool.execute({ path: '/src/app.ts', offset: 5, length: 10 }, context)
		expect(tracker.hasRead('/src/app.ts')).toBe(true)

		// Modify externally
		updateFile('/src/app.ts', 'modified')

		// Write should detect staleness
		const writeResult = await fsWriteTool.execute({ path: '/src/app.ts', content: 'new' }, context)
		expect(writeResult.success).toBe(false)
		expect(writeResult.errorCode).toBe('STALE_FILE')
	})
})

describe('apply_changes stale detection', () => {
	it('should check staleness for all modified files in batch', async () => {
		const { provider, updateFile } = createMockProvider({
			'/src/a.ts': 'content a',
			'/src/b.ts': 'content b'
		})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		// Read both files
		await fsReadTool.execute({ path: '/src/a.ts' }, context)
		await fsReadTool.execute({ path: '/src/b.ts' }, context)

		// Modify file b externally
		updateFile('/src/b.ts', 'modified b')

		// Try to apply changes to both - should fail due to stale b.ts
		const result = await applyChangesTool.execute(
			{
				changes: [
					{ path: '/src/a.ts', type: 'modify', content: 'new a' },
					{ path: '/src/b.ts', type: 'modify', content: 'new b' }
				]
			},
			context
		)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('STALE_FILE')
		expect(result.error).toContain('/src/b.ts')
	})

	it('should fail entire batch if any file is stale', async () => {
		const { provider, updateFile, files } = createMockProvider({
			'/src/a.ts': 'content a',
			'/src/b.ts': 'content b'
		})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		// Read both files
		await fsReadTool.execute({ path: '/src/a.ts' }, context)
		await fsReadTool.execute({ path: '/src/b.ts' }, context)

		// Modify file a externally
		updateFile('/src/a.ts', 'modified a')

		// Try to apply changes
		const result = await applyChangesTool.execute(
			{
				changes: [
					{ path: '/src/a.ts', type: 'modify', content: 'new a' },
					{ path: '/src/b.ts', type: 'modify', content: 'new b' }
				]
			},
			context
		)

		expect(result.success).toBe(false)

		// Neither file should have been modified
		expect(files.get('/src/a.ts')?.content).toBe('modified a') // Still external version
		expect(files.get('/src/b.ts')?.content).toBe('content b') // Unchanged
	})

	it('should skip staleness check for create operations', async () => {
		const { provider } = createMockProvider({
			'/src/existing.ts': 'existing content'
		})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		// Apply a create operation without reading first
		const result = await applyChangesTool.execute(
			{
				changes: [{ path: '/src/new.ts', type: 'create', content: 'brand new' }]
			},
			context
		)

		expect(result.success).toBe(true)
	})

	it('should clear tracking after successful apply', async () => {
		const { provider } = createMockProvider({
			'/src/a.ts': 'content a',
			'/src/b.ts': 'content b'
		})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		// Read both files
		await fsReadTool.execute({ path: '/src/a.ts' }, context)
		await fsReadTool.execute({ path: '/src/b.ts' }, context)
		expect(tracker.hasRead('/src/a.ts')).toBe(true)
		expect(tracker.hasRead('/src/b.ts')).toBe(true)

		// Apply changes successfully
		await applyChangesTool.execute(
			{
				changes: [
					{ path: '/src/a.ts', type: 'modify', content: 'new a' },
					{ path: '/src/b.ts', type: 'modify', content: 'new b' }
				]
			},
			context
		)

		// Tracking should be cleared
		expect(tracker.hasRead('/src/a.ts')).toBe(false)
		expect(tracker.hasRead('/src/b.ts')).toBe(false)
	})

	it('should work without fileTracker (backward compatibility)', async () => {
		const { provider } = createMockProvider({
			'/src/app.ts': 'original'
		})
		// No fileTracker
		const context = createContext(provider, undefined)

		const result = await applyChangesTool.execute(
			{
				changes: [{ path: '/src/app.ts', type: 'modify', content: 'new' }]
			},
			context
		)

		expect(result.success).toBe(true)
	})

	it('should check staleness for delete operations', async () => {
		const { provider, updateFile } = createMockProvider({
			'/src/app.ts': 'original content'
		})
		const tracker = new FileReadTracker()
		const context = createContext(provider, tracker)

		// Read the file
		await fsReadTool.execute({ path: '/src/app.ts' }, context)

		// Modify externally
		updateFile('/src/app.ts', 'modified externally')

		// Try to delete - should detect staleness
		const result = await applyChangesTool.execute(
			{
				changes: [{ path: '/src/app.ts', type: 'delete' }]
			},
			context
		)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('STALE_FILE')
	})
})
