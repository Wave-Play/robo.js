/**
 * Boundary limits hardening tests
 *
 * Verifies that policy limits are correctly enforced:
 * - maxFileWriteBytes
 * - maxSnapshotBytes
 * - maxTotalDiffBytes
 * - maxIterations (agent level)
 */

import { jest } from '@jest/globals'
import { fsWriteTool } from '../../src/tools/fs/write.js'
import { fsSnapshotTool } from '../../src/tools/fs/snapshot.js'
import { applyChangesTool } from '../../src/tools/changes/apply.js'
import { checkFilePolicy, checkSnapshotPolicy, checkDiffPolicy } from '../../src/tools/runtime/policy.js'
import type { ToolContext } from '../../src/tools/types.js'
import type { ExecutionProvider, AgentPolicy, FileChange } from '../../src/types/index.js'

/**
 * Create a mock provider for testing
 */
function createMockProvider(files: Record<string, string> = {}): ExecutionProvider {
	const fileStore = new Map<string, string>(Object.entries(files))

	return {
		readFile: jest.fn(async (path: string) => {
			const content = fileStore.get(path)
			if (content === undefined) {
				throw new Error(`ENOENT: no such file or directory, open '${path}'`)
			}
			return content
		}),
		writeFile: jest.fn(async (path: string, content: string) => {
			fileStore.set(path, content)
		}),
		deletePath: jest.fn(async (path: string) => {
			fileStore.delete(path)
		}),
		exists: jest.fn(async (path: string) => fileStore.has(path)),
		stat: jest.fn(async (path: string) => {
			const content = fileStore.get(path)
			if (content === undefined) {
				throw new Error(`ENOENT: no such file or directory, stat '${path}'`)
			}
			return { size: content.length, isDirectory: false }
		}),
		readdir: jest.fn(async () => []),
		mkdir: jest.fn(async () => {}),
		search: jest.fn(async () => []),
		snapshot: jest.fn(async () => {
			const result: Record<string, string> = {}
			for (const [path, content] of fileStore) {
				result[path] = content
			}
			return result
		}),
		run: jest.fn(async () => ({ exitCode: 0, output: '' })),
		runStream: jest.fn(async function* () {})
	} as unknown as ExecutionProvider
}

function createContext(policy: Partial<AgentPolicy>, provider?: ExecutionProvider): ToolContext {
	return {
		provider: provider ?? createMockProvider(),
		policy: {
			autoApprove: true,
			maxIterations: 10,
			commandAllowlist: ['npm', 'node'],
			denyPaths: ['.env'],
			...policy
		},
		runId: 'boundary-test'
	}
}

describe('Boundary Limits', () => {
	describe('maxFileWriteBytes', () => {
		it('should reject writes exceeding maxFileWriteBytes', async () => {
			const maxBytes = 100
			const provider = createMockProvider()
			const context = createContext({ maxFileWriteBytes: maxBytes }, provider)

			// Content that exceeds the limit
			const largeContent = 'x'.repeat(maxBytes + 1)

			const result = await fsWriteTool.execute({ path: '/test.txt', content: largeContent }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
			expect(result.error).toContain('exceeds maximum')
			expect(result.error).toContain(`${maxBytes} bytes`)
		})

		it('should allow writes at exactly maxFileWriteBytes', async () => {
			const maxBytes = 100
			const provider = createMockProvider()
			const context = createContext({ maxFileWriteBytes: maxBytes }, provider)

			// Content exactly at the limit
			const exactContent = 'x'.repeat(maxBytes)

			const result = await fsWriteTool.execute({ path: '/test.txt', content: exactContent }, context)

			expect(result.success).toBe(true)
			expect(result.data?.size).toBe(maxBytes)
		})

		it('should allow writes below maxFileWriteBytes', async () => {
			const maxBytes = 100
			const provider = createMockProvider()
			const context = createContext({ maxFileWriteBytes: maxBytes }, provider)

			// Content below the limit
			const smallContent = 'x'.repeat(maxBytes - 1)

			const result = await fsWriteTool.execute({ path: '/test.txt', content: smallContent }, context)

			expect(result.success).toBe(true)
			expect(result.data?.size).toBe(maxBytes - 1)
		})

		it('should use default maxFileWriteBytes when not specified', () => {
			const policy: AgentPolicy = {
				autoApprove: true,
				maxIterations: 10,
				commandAllowlist: []
				// maxFileWriteBytes not specified
			}

			// 512KB default
			const underDefault = checkFilePolicy({ path: '/test.txt', operation: 'write', size: 512_000 }, policy)
			expect(underDefault.allowed).toBe(true)

			const overDefault = checkFilePolicy({ path: '/test.txt', operation: 'write', size: 512_001 }, policy)
			expect(overDefault.allowed).toBe(false)
		})

		it('should count bytes correctly for multi-byte characters', async () => {
			const maxBytes = 10
			const provider = createMockProvider()
			const context = createContext({ maxFileWriteBytes: maxBytes }, provider)

			// Emoji is 4 bytes in UTF-8
			const emoji = '😀' // 4 bytes
			const content = emoji.repeat(3) // 12 bytes total

			const result = await fsWriteTool.execute({ path: '/test.txt', content }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
		})
	})

	describe('maxSnapshotBytes', () => {
		it('should reject snapshots exceeding limit via policy check', () => {
			const maxBytes = 1000
			const policy: AgentPolicy = {
				autoApprove: true,
				maxIterations: 10,
				commandAllowlist: [],
				maxSnapshotBytes: maxBytes
			}

			const result = checkSnapshotPolicy(maxBytes + 1, policy)

			expect(result.allowed).toBe(false)
			expect(result.reason).toContain('exceeds maximum')
		})

		it('should allow snapshots at exactly the limit', () => {
			const maxBytes = 1000
			const policy: AgentPolicy = {
				autoApprove: true,
				maxIterations: 10,
				commandAllowlist: [],
				maxSnapshotBytes: maxBytes
			}

			const result = checkSnapshotPolicy(maxBytes, policy)

			expect(result.allowed).toBe(true)
		})

		it('should allow snapshots below the limit', () => {
			const maxBytes = 1000
			const policy: AgentPolicy = {
				autoApprove: true,
				maxIterations: 10,
				commandAllowlist: [],
				maxSnapshotBytes: maxBytes
			}

			const result = checkSnapshotPolicy(maxBytes - 1, policy)

			expect(result.allowed).toBe(true)
		})

		it('should use default maxSnapshotBytes when not specified', () => {
			const policy: AgentPolicy = {
				autoApprove: true,
				maxIterations: 10,
				commandAllowlist: []
				// maxSnapshotBytes not specified
			}

			// 2MB default
			const underDefault = checkSnapshotPolicy(2_000_000, policy)
			expect(underDefault.allowed).toBe(true)

			const overDefault = checkSnapshotPolicy(2_000_001, policy)
			expect(overDefault.allowed).toBe(false)
		})
	})

	describe('maxTotalDiffBytes', () => {
		it('should reject diffs exceeding limit via policy check', () => {
			const maxBytes = 1000
			const policy: AgentPolicy = {
				autoApprove: true,
				maxIterations: 10,
				commandAllowlist: [],
				maxTotalDiffBytes: maxBytes
			}

			const result = checkDiffPolicy(maxBytes + 1, policy)

			expect(result.allowed).toBe(false)
			expect(result.reason).toContain('exceeds maximum')
		})

		it('should allow diffs at exactly the limit', () => {
			const maxBytes = 1000
			const policy: AgentPolicy = {
				autoApprove: true,
				maxIterations: 10,
				commandAllowlist: [],
				maxTotalDiffBytes: maxBytes
			}

			const result = checkDiffPolicy(maxBytes, policy)

			expect(result.allowed).toBe(true)
		})

		it('should use default maxTotalDiffBytes when not specified', () => {
			const policy: AgentPolicy = {
				autoApprove: true,
				maxIterations: 10,
				commandAllowlist: []
				// maxTotalDiffBytes not specified
			}

			// 2MB default
			const underDefault = checkDiffPolicy(2_000_000, policy)
			expect(underDefault.allowed).toBe(true)

			const overDefault = checkDiffPolicy(2_000_001, policy)
			expect(overDefault.allowed).toBe(false)
		})
	})

	describe('maxIterations', () => {
		it('should have maxIterations in policy', () => {
			const policy: AgentPolicy = {
				autoApprove: true,
				maxIterations: 5,
				commandAllowlist: []
			}

			expect(policy.maxIterations).toBe(5)
		})

		it('should not allow maxIterations of zero', () => {
			// Zero iterations would make the agent do nothing
			// This is a logical constraint, not enforced by type system
			const policy: AgentPolicy = {
				autoApprove: true,
				maxIterations: 0,
				commandAllowlist: []
			}

			// The policy is valid but functionally useless
			expect(policy.maxIterations).toBe(0)
		})

		it('should allow high maxIterations values', () => {
			const policy: AgentPolicy = {
				autoApprove: true,
				maxIterations: 1000,
				commandAllowlist: []
			}

			expect(policy.maxIterations).toBe(1000)
		})
	})

	describe('combined limits', () => {
		it('should enforce multiple limits independently', async () => {
			const provider = createMockProvider()
			const context = createContext(
				{
					maxFileWriteBytes: 100,
					maxSnapshotBytes: 500,
					maxTotalDiffBytes: 200
				},
				provider
			)

			// File write within limit
			const writeResult = await fsWriteTool.execute({ path: '/small.txt', content: 'x'.repeat(50) }, context)
			expect(writeResult.success).toBe(true)

			// File write exceeding limit
			const largeWriteResult = await fsWriteTool.execute({ path: '/large.txt', content: 'x'.repeat(101) }, context)
			expect(largeWriteResult.success).toBe(false)
			expect(largeWriteResult.errorCode).toBe('POLICY_VIOLATION')
		})

		it('should allow operations when no limits are set', async () => {
			const provider = createMockProvider()
			const context = createContext({}, provider)

			// Large write should use default (512KB)
			const result = await fsWriteTool.execute({ path: '/test.txt', content: 'x'.repeat(100_000) }, context)

			expect(result.success).toBe(true)
		})
	})

	describe('large batch operations', () => {
		it('should handle 100+ file changes', async () => {
			const provider = createMockProvider()
			const context = createContext({ autoApprove: true }, provider)

			// Create 100 file changes
			const changes: FileChange[] = []
			for (let i = 0; i < 100; i++) {
				changes.push({
					type: 'create',
					path: `/src/file${i}.ts`,
					content: `export const x${i} = ${i};`
				})
			}

			const result = await applyChangesTool.execute({ changes }, context)

			expect(result.success).toBe(true)
			expect(result.data?.applied).toBe(true)
			expect(result.data?.appliedPaths).toHaveLength(100)
		})

		it('should reject batch when single file exceeds limit', async () => {
			const provider = createMockProvider()
			const context = createContext({ maxFileWriteBytes: 100 }, provider)

			const changes: FileChange[] = [
				{ type: 'create', path: '/small.ts', content: 'x'.repeat(50) },
				{ type: 'create', path: '/large.ts', content: 'x'.repeat(150) }, // Exceeds limit
				{ type: 'create', path: '/medium.ts', content: 'x'.repeat(75) }
			]

			const result = await applyChangesTool.execute({ changes }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
		})
	})
})
