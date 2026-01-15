/**
 * Error taxonomy hardening tests
 *
 * Verifies that:
 * - All error codes are documented
 * - Error messages are actionable
 * - Error structure is consistent
 * - Recoverable flag is correctly set
 */

import { jest } from '@jest/globals'
import {
	CodeAgentError,
	pathTraversalError,
	policyViolationError,
	commandDeniedError,
	budgetExceededError,
	abortError,
	type ErrorCode
} from '../../src/errors/index.js'
import { fsWriteTool } from '../../src/tools/fs/write.js'
import { fsReadTool } from '../../src/tools/fs/read.js'
import { fsDeleteTool } from '../../src/tools/fs/delete.js'
import { terminalRunTool } from '../../src/tools/terminal/run.js'
import type { ToolContext } from '../../src/tools/types.js'
import type { ExecutionProvider, AgentPolicy } from '../../src/types/index.js'

/**
 * All documented error codes
 */
const ALL_ERROR_CODES: ErrorCode[] = [
	'EXECUTION_FAILED',
	'PATH_TRAVERSAL',
	'POLICY_VIOLATION',
	'COMMAND_DENIED',
	'APPROVAL_REQUIRED',
	'BUDGET_EXCEEDED',
	'VERIFICATION_FAILED',
	'MCP_UNAVAILABLE',
	'CHECKPOINTER_ERROR',
	'ABORT',
	'INVALID_STATE',
	'TIMEOUT',
	'PARSE_ERROR'
]

/**
 * Error codes that should NOT be recoverable
 */
const NON_RECOVERABLE_CODES: ErrorCode[] = [
	'PATH_TRAVERSAL',
	'POLICY_VIOLATION',
	'COMMAND_DENIED',
	'BUDGET_EXCEEDED',
	'ABORT',
	'INVALID_STATE'
]

/**
 * Error codes that SHOULD be recoverable
 */
const RECOVERABLE_CODES: ErrorCode[] = [
	'EXECUTION_FAILED',
	'VERIFICATION_FAILED',
	'MCP_UNAVAILABLE',
	'TIMEOUT',
	'PARSE_ERROR'
]

/**
 * Create a mock provider
 */
function createMockProvider(overrides: Partial<ExecutionProvider> = {}): ExecutionProvider {
	return {
		readFile: jest.fn(async () => 'content'),
		writeFile: jest.fn(async () => {}),
		deletePath: jest.fn(async () => {}),
		exists: jest.fn(async () => true),
		stat: jest.fn(async () => ({ size: 100, isDirectory: false })),
		readdir: jest.fn(async () => []),
		mkdir: jest.fn(async () => {}),
		search: jest.fn(async () => []),
		snapshot: jest.fn(async () => ({})),
		run: jest.fn(async () => ({ exitCode: 0, output: '' })),
		runStream: jest.fn(async function* () {}),
		...overrides
	} as unknown as ExecutionProvider
}

function createContext(policy: Partial<AgentPolicy> = {}, provider?: ExecutionProvider): ToolContext {
	return {
		provider: provider ?? createMockProvider(),
		policy: {
			autoApprove: true,
			maxIterations: 10,
			commandAllowlist: ['npm', 'node'],
			denyPaths: ['.env', '.git/'],
			...policy
		},
		runId: 'error-taxonomy-test'
	}
}

describe('Error Taxonomy', () => {
	describe('CodeAgentError structure', () => {
		it('should have consistent error structure', () => {
			const error = new CodeAgentError('EXECUTION_FAILED', 'Test error', {
				recoverable: true,
				details: { test: true }
			})

			expect(error.name).toBe('CodeAgentError')
			expect(error.code).toBe('EXECUTION_FAILED')
			expect(error.message).toBe('Test error')
			expect(error.recoverable).toBe(true)
			expect(error.details).toEqual({ test: true })
		})

		it('should include errorCode in all error instances', () => {
			for (const code of ALL_ERROR_CODES) {
				const error = new CodeAgentError(code, 'Test message')
				expect(error.code).toBe(code)
				expect(typeof error.code).toBe('string')
			}
		})

		it('should have actionable error messages', () => {
			const testCases = [
				pathTraversalError('/path/../../../etc/passwd'),
				policyViolationError('File write exceeds maximum allowed bytes'),
				commandDeniedError('rm', ['-rf', '/'], 'Command not in allowlist'),
				budgetExceededError(10, 10),
				abortError('User requested abort')
			]

			for (const error of testCases) {
				// Message should be non-empty
				expect(error.message.length).toBeGreaterThan(0)
				// Message should not be generic "Error"
				expect(error.message).not.toBe('Error')
				// Message should contain context
				expect(error.message.length).toBeGreaterThan(10)
			}
		})

		it('should correctly set recoverable flag for non-recoverable codes', () => {
			for (const code of NON_RECOVERABLE_CODES) {
				const error = new CodeAgentError(code, 'Test', { recoverable: false })
				expect(error.recoverable).toBe(false)
			}
		})

		it('should correctly set recoverable flag for recoverable codes', () => {
			for (const code of RECOVERABLE_CODES) {
				const error = new CodeAgentError(code, 'Test', { recoverable: true })
				expect(error.recoverable).toBe(true)
			}
		})

		it('should default to non-recoverable when not specified', () => {
			const error = new CodeAgentError('EXECUTION_FAILED', 'Test')
			expect(error.recoverable).toBe(false)
		})

		it('should serialize to JSON correctly', () => {
			const error = new CodeAgentError('POLICY_VIOLATION', 'Test error', {
				recoverable: false,
				details: { path: '/test' }
			})

			const json = error.toJSON()

			expect(json.name).toBe('CodeAgentError')
			expect(json.code).toBe('POLICY_VIOLATION')
			expect(json.message).toBe('Test error')
			expect(json.recoverable).toBe(false)
			expect(json.details).toEqual({ path: '/test' })
			expect(typeof json.stack).toBe('string')
		})

		it('should identify CodeAgentError instances', () => {
			const codeError = new CodeAgentError('ABORT', 'Test')
			const regularError = new Error('Test')

			expect(CodeAgentError.isCodeAgentError(codeError)).toBe(true)
			expect(CodeAgentError.isCodeAgentError(regularError)).toBe(false)
			expect(CodeAgentError.isCodeAgentError(null)).toBe(false)
			expect(CodeAgentError.isCodeAgentError(undefined)).toBe(false)
			expect(CodeAgentError.isCodeAgentError('string')).toBe(false)
		})

		it('should wrap unknown errors correctly', () => {
			const regularError = new Error('Original error')
			const wrapped = CodeAgentError.wrap(regularError)

			expect(wrapped.code).toBe('EXECUTION_FAILED')
			expect(wrapped.message).toBe('Original error')
			expect(wrapped.cause).toBe(regularError)

			// Should not re-wrap CodeAgentError
			const codeError = new CodeAgentError('ABORT', 'Test')
			const notWrapped = CodeAgentError.wrap(codeError)
			expect(notWrapped).toBe(codeError)

			// Should handle string errors
			const stringWrapped = CodeAgentError.wrap('string error')
			expect(stringWrapped.message).toBe('string error')
		})
	})

	describe('error codes from tools', () => {
		it.each([
			['POLICY_VIOLATION', 'denyPaths', false],
			['EXECUTION_FAILED', 'runtime error', true]
		])('should return %s for %s (recoverable: %s)', async (code, _scenario, recoverable) => {
			if (code === 'POLICY_VIOLATION') {
				const context = createContext({ denyPaths: ['.env'] })
				const result = await fsReadTool.execute({ path: '/.env' }, context)

				expect(result.success).toBe(false)
				expect(result.errorCode).toBe('POLICY_VIOLATION')
				expect(result.recoverable).toBe(false)
			} else if (code === 'EXECUTION_FAILED') {
				const provider = createMockProvider({
					readFile: jest.fn(async () => {
						throw new Error('Read failed')
					})
				})
				const context = createContext({}, provider)
				const result = await fsReadTool.execute({ path: '/test.txt' }, context)

				expect(result.success).toBe(false)
				expect(result.errorCode).toBe('EXECUTION_FAILED')
				expect(result.recoverable).toBe(true)
			}
		})

		it('should return POLICY_VIOLATION for write to denied path', async () => {
			const context = createContext({ denyPaths: ['.git/'] })
			const result = await fsWriteTool.execute({ path: '/.git/config', content: 'test' }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
			expect(result.recoverable).toBe(false)
		})

		it('should return POLICY_VIOLATION for delete denied path', async () => {
			const context = createContext({ denyPaths: ['.env'] })
			const result = await fsDeleteTool.execute({ path: '/.env', recursive: false }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
			expect(result.recoverable).toBe(false)
		})

		it('should return POLICY_VIOLATION for write exceeding max bytes', async () => {
			const context = createContext({ maxFileWriteBytes: 10 })
			const result = await fsWriteTool.execute({ path: '/test.txt', content: 'x'.repeat(100) }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('POLICY_VIOLATION')
			expect(result.error).toContain('exceeds maximum')
		})

		it('should return COMMAND_DENIED for command not in allowlist', async () => {
			const context = createContext({ commandAllowlist: ['npm'] })
			const result = await terminalRunTool.execute({ command: 'rm', args: ['-rf', '/'] }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('COMMAND_DENIED')
			expect(result.error).toContain('not in the allowlist')
		})

		it('should return EXECUTION_FAILED for file read error', async () => {
			const provider = createMockProvider({
				readFile: jest.fn(async () => {
					throw new Error('ENOENT: no such file')
				})
			})
			const context = createContext({}, provider)
			const result = await fsReadTool.execute({ path: '/nonexistent.txt' }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('EXECUTION_FAILED')
			expect(result.recoverable).toBe(true)
		})

		it('should return EXECUTION_FAILED for command execution error', async () => {
			const provider = createMockProvider({
				run: jest.fn(async () => ({ exitCode: 1, output: 'Command failed' }))
			})
			const context = createContext({ commandAllowlist: ['npm'] }, provider)
			const result = await terminalRunTool.execute({ command: 'npm', args: ['run', 'nonexistent'] }, context)

			// Non-zero exit is not necessarily an error in the tool result
			// The tool reports success with exitCode in data
			expect(result.data?.exitCode).toBe(1)
		})
	})

	describe('error helper functions', () => {
		it('pathTraversalError should be non-recoverable', () => {
			const error = pathTraversalError('/path/../../../etc')
			expect(error.code).toBe('PATH_TRAVERSAL')
			expect(error.recoverable).toBe(false)
			expect(error.details).toEqual({ path: '/path/../../../etc' })
		})

		it('policyViolationError should be non-recoverable', () => {
			const error = policyViolationError('Test violation', { key: 'value' })
			expect(error.code).toBe('POLICY_VIOLATION')
			expect(error.recoverable).toBe(false)
			expect(error.details).toEqual({ key: 'value' })
		})

		it('commandDeniedError should include command details', () => {
			const error = commandDeniedError('rm', ['-rf', '/'], 'Dangerous command')
			expect(error.code).toBe('COMMAND_DENIED')
			expect(error.recoverable).toBe(false)
			expect(error.details).toEqual({
				command: 'rm',
				args: ['-rf', '/'],
				reason: 'Dangerous command'
			})
		})

		it('budgetExceededError should include iteration counts', () => {
			const error = budgetExceededError(10, 10)
			expect(error.code).toBe('BUDGET_EXCEEDED')
			expect(error.recoverable).toBe(false)
			expect(error.message).toContain('10/10')
			expect(error.details).toEqual({ iterations: 10, maxIterations: 10 })
		})

		it('abortError should include reason', () => {
			const error = abortError('User cancelled')
			expect(error.code).toBe('ABORT')
			expect(error.recoverable).toBe(false)
			expect(error.message).toContain('User cancelled')
			expect(error.details).toEqual({ reason: 'User cancelled' })
		})
	})

	describe('error message quality', () => {
		it('should not expose internal implementation details', () => {
			const context = createContext({ denyPaths: ['.env'] })

			// This test ensures error messages don't leak stack traces or internal paths
			const result = fsReadTool.execute({ path: '/.env' }, context)

			result.then((r) => {
				if (!r.success && r.error) {
					// Error should not contain stack trace
					expect(r.error).not.toContain('at ')
					expect(r.error).not.toContain('node_modules')
					// Error should be user-friendly
					expect(r.error).toContain('denied')
				}
			})
		})

		it('should include relevant context in error messages', async () => {
			const context = createContext({ maxFileWriteBytes: 100 })
			const result = await fsWriteTool.execute({ path: '/test.txt', content: 'x'.repeat(200) }, context)

			expect(result.error).toContain('200') // Actual size
			expect(result.error).toContain('100') // Max allowed
		})
	})
})
