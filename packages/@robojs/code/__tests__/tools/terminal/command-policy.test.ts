/**
 * Unit tests for terminal command policy enforcement
 */

import { jest } from '@jest/globals'
import { terminalRunTool } from '../../../src/tools/terminal/run.js'
import { terminalRunStreamTool } from '../../../src/tools/terminal/run-stream.js'
import { terminalSessionStartTool } from '../../../src/tools/terminal/session-start.js'
import type { ToolContext } from '../../../src/tools/types.js'
import type { ExecutionProvider, AgentPolicy } from '../../../src/types/index.js'

// Mock provider
function createMockProvider() {
	return {
		readFile: jest.fn(async () => ''),
		writeFile: jest.fn(async () => {}),
		deletePath: jest.fn(async () => {}),
		stat: jest.fn(async () => ({ size: 0, isDirectory: false })),
		list: jest.fn(async () => []),
		search: jest.fn(async () => []),
		snapshot: jest.fn(async () => ({})),
		run: jest.fn(async (command: string, args: string[]) => ({
			exitCode: 0,
			output: `Ran: ${command} ${args.join(' ')}`
		})),
		runStream: jest.fn(async (command: string, args: string[]) => ({
			exitCode: 0,
			output: `Streamed: ${command} ${args.join(' ')}`
		})),
		startSession: jest.fn(async () => ({
			sessionId: 'test-session-123',
			command: 'bash',
			args: []
		})),
		sessionStream: jest.fn(async () => ({ output: '' })),
		stopSession: jest.fn(async () => {}),
		grep: jest.fn(async () => []),
		head: jest.fn(async () => ({ content: '', truncated: false })),
		tail: jest.fn(async () => ({ content: '', truncated: false })),
		range: jest.fn(async () => ({ content: '', truncated: false })),
		outline: jest.fn(async () => [])
	}
}

function createPolicy(overrides: Partial<AgentPolicy> = {}): AgentPolicy {
	return {
		autoApprove: false,
		maxIterations: 10,
		denyPaths: [],
		commandAllowlist: ['npm', 'node', 'git', 'ls', 'cat', 'echo'],
		commandArgPolicy: {
			disallow: [{ command: 'node', argsPrefix: ['-e', '--eval', '-p', '--print'] }],
			requireApproval: [{ command: 'npm', argsPrefix: ['run'] }]
		},
		...overrides
	}
}

function createContext(policy: Partial<AgentPolicy> = {}): ToolContext {
	return {
		provider: createMockProvider() as unknown as ExecutionProvider,
		policy: createPolicy(policy),
		runId: 'test-run-id'
	}
}

describe('terminal_run command allowlist', () => {
	it('should allow commands in allowlist', async () => {
		const context = createContext({ autoApprove: true })

		const result = await terminalRunTool.execute({ command: 'npm', args: ['install'] }, context)

		expect(result.success).toBe(true)
	})

	it('should deny commands not in allowlist', async () => {
		const context = createContext()

		const result = await terminalRunTool.execute({ command: 'rm', args: ['-rf', '/'] }, context)

		expect(result.success).toBe(false)
		expect(result.error).toContain('rm')
	})

	it('should deny commands not in allowlist without requesting approval', async () => {
		const context = createContext({ autoApprove: false })

		const result = await terminalRunTool.execute({ command: 'curl', args: ['https://example.com'] }, context)

		expect(result.success).toBe(false)
		// Commands not in allowlist are simply denied, not approvable
		expect(result.error).toContain('curl')
	})

	it('should deny all commands when allowlist is empty', async () => {
		const context = createContext({ commandAllowlist: [], autoApprove: true })

		const result = await terminalRunTool.execute({ command: 'any-command', args: ['--flag'] }, context)

		// Empty allowlist means no commands are allowed
		expect(result.success).toBe(false)
	})
})

describe('terminal_run argument policies', () => {
	describe('disallow patterns', () => {
		it('should deny dangerous node arguments', async () => {
			const context = createContext()

			const result = await terminalRunTool.execute({ command: 'node', args: ['-e', 'process.exit(1)'] }, context)

			expect(result.success).toBe(false)
			expect(result.error).toContain('-e')
		})

		it('should deny --eval flag', async () => {
			const context = createContext()

			const result = await terminalRunTool.execute({ command: 'node', args: ['--eval', 'code'] }, context)

			expect(result.success).toBe(false)
		})

		it('should deny -p (print) flag', async () => {
			const context = createContext()

			const result = await terminalRunTool.execute({ command: 'node', args: ['-p', '1+1'] }, context)

			expect(result.success).toBe(false)
		})

		it('should allow safe node usage', async () => {
			const context = createContext({ autoApprove: true })

			const result = await terminalRunTool.execute({ command: 'node', args: ['index.js', '--flag', 'value'] }, context)

			expect(result.success).toBe(true)
		})
	})

	describe('requireApproval patterns', () => {
		it('should require approval for npm run', async () => {
			const context = createContext({ autoApprove: false })

			const result = await terminalRunTool.execute({ command: 'npm', args: ['run', 'build'] }, context)

			expect(result.success).toBe(false)
			expect(result.requiresApproval).toBe(true)
		})

		it('should allow npm run when auto-approved', async () => {
			const context = createContext({ autoApprove: true })

			const result = await terminalRunTool.execute({ command: 'npm', args: ['run', 'build'] }, context)

			// With autoApprove, it proceeds
			expect(result.success).toBe(true)
		})

		it('should allow npm install without approval', async () => {
			const context = createContext({ autoApprove: false })

			const result = await terminalRunTool.execute({ command: 'npm', args: ['install', 'lodash'] }, context)

			// npm install doesn't require approval
			expect(result.success).toBe(true)
		})

		it('should allow npm test without approval', async () => {
			const context = createContext({ autoApprove: false })

			const result = await terminalRunTool.execute({ command: 'npm', args: ['test'] }, context)

			expect(result.success).toBe(true)
		})
	})
})

describe('terminal_run_stream command policy', () => {
	it('should apply same command allowlist', async () => {
		const context = createContext()

		const result = await terminalRunStreamTool.execute({ command: 'curl', args: ['https://evil.com'] }, context)

		expect(result.success).toBe(false)
	})

	it('should apply same argument policies', async () => {
		const context = createContext()

		const result = await terminalRunStreamTool.execute({ command: 'node', args: ['-e', 'evil code'] }, context)

		expect(result.success).toBe(false)
	})
})

describe('terminal_session_start command policy', () => {
	it('should apply command allowlist to sessions', async () => {
		const context = createContext()

		const result = await terminalSessionStartTool.execute({ command: 'bash', args: [] }, context)

		// bash is not in the allowlist
		expect(result.success).toBe(false)
	})

	it('should apply argument policies to sessions', async () => {
		const context = createContext()

		const result = await terminalSessionStartTool.execute({ command: 'node', args: ['-e', 'repl'] }, context)

		expect(result.success).toBe(false)
	})

	it('should allow approved session commands', async () => {
		const context = createContext({
			commandAllowlist: ['node'],
			commandArgPolicy: {},
			autoApprove: true
		})

		const result = await terminalSessionStartTool.execute({ command: 'node', args: ['--inspect', 'app.js'] }, context)

		expect(result.success).toBe(true)
	})
})

describe('policy edge cases', () => {
	it('should handle empty args gracefully', async () => {
		const context = createContext({ autoApprove: true })

		const result = await terminalRunTool.execute({ command: 'ls', args: [] }, context)

		expect(result.success).toBe(true)
	})

	it('should handle undefined commandArgPolicy', async () => {
		const context = createContext({
			commandAllowlist: ['node'],
			commandArgPolicy: undefined,
			autoApprove: true
		})

		const result = await terminalRunTool.execute({ command: 'node', args: ['-e', 'console.log(1)'] }, context)

		// Without commandArgPolicy, -e should be allowed
		expect(result.success).toBe(true)
	})

	it('should be case-sensitive for commands', async () => {
		const context = createContext({
			commandAllowlist: ['npm']
		})

		const result = await terminalRunTool.execute({ command: 'NPM', args: ['install'] }, context)

		// NPM (uppercase) is not npm
		expect(result.success).toBe(false)
	})
})
