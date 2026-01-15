/**
 * Integration tests for terminal tools workflow
 *
 * Tests command execution with policy enforcement and streaming.
 */

import { jest } from '@jest/globals'
import { terminalRunTool } from '../../src/tools/terminal/run.js'
import { terminalRunStreamTool } from '../../src/tools/terminal/run-stream.js'
import { terminalSessionStartTool } from '../../src/tools/terminal/session-start.js'
import { terminalSessionStopTool } from '../../src/tools/terminal/session-stop.js'
import type { ToolContext } from '../../src/tools/types.js'
import type { ExecutionProvider, AgentPolicy } from '../../src/types/index.js'

/**
 * Create a mock provider for terminal operations
 */
function createMockProvider(): {
	provider: ExecutionProvider
	commandLog: Array<{ command: string; args: string[]; timestamp: number }>
	sessions: Map<string, { command: string; args: string[]; active: boolean }>
} {
	const commandLog: Array<{ command: string; args: string[]; timestamp: number }> = []
	const sessions = new Map<string, { command: string; args: string[]; active: boolean }>()
	let sessionCounter = 0

	const provider: ExecutionProvider = {
		readFile: jest.fn(async () => ''),
		writeFile: jest.fn(async () => {}),
		deletePath: jest.fn(async () => {}),
		exists: jest.fn(async () => false),
		stat: jest.fn(async () => ({ size: 0, isDirectory: false })),
		list: jest.fn(async () => []),
		search: jest.fn(async () => []),
		snapshot: jest.fn(async () => ({})),

		run: jest.fn(async (command: string, args: string[]) => {
			commandLog.push({ command, args, timestamp: Date.now() })

			// Simulate different command outputs
			if (command === 'npm' && args[0] === 'version') {
				return { exitCode: 0, output: '10.0.0' }
			}
			if (command === 'node' && args[0] === '--version') {
				return { exitCode: 0, output: 'v20.0.0' }
			}
			if (command === 'npm' && args[0] === 'run' && args[1] === 'build') {
				return { exitCode: 0, output: 'Build successful!' }
			}
			if (command === 'npm' && args[0] === 'test') {
				return { exitCode: 0, output: 'All tests passed!' }
			}
			if (command === 'npm' && args[0] === 'install') {
				return { exitCode: 0, output: 'Packages installed.' }
			}
			if (command === 'git' && args[0] === 'status') {
				return { exitCode: 0, output: 'On branch main\nnothing to commit' }
			}

			return { exitCode: 0, output: `${command} ${args.join(' ')}` }
		}),

		runStream: jest.fn(async function* (command: string, args: string[]) {
			commandLog.push({ command, args, timestamp: Date.now() })

			// Simulate streaming output with 'output' type and 'text' property
			yield { type: 'output' as const, text: `Starting ${command}...\n` }
			yield { type: 'output' as const, text: 'Processing...\n' }
			yield { type: 'output' as const, text: 'Done!\n' }
			yield { type: 'exit' as const, exitCode: 0 }
		}),

		startSession: jest.fn(async (command: string, args: string[]) => {
			const sessionId = `session-${++sessionCounter}`
			sessions.set(sessionId, { command, args, active: true })
			return {
				id: sessionId,
				pid: 12345
			}
		}),

		stopSession: jest.fn(async (session: { id: string }) => {
			const sessionData = sessions.get(session.id)
			if (sessionData) sessionData.active = false
		}),

		streamSession: jest.fn(async function* (sessionId: string) {
			yield { type: 'output' as const, text: `Session ${sessionId} ready\n` }
		})
	} as unknown as ExecutionProvider

	return { provider, commandLog, sessions }
}

function createContext(policy: Partial<AgentPolicy>, provider: ExecutionProvider): ToolContext {
	return {
		provider,
		policy: {
			autoApprove: true,
			maxIterations: 10,
			commandAllowlist: ['npm', 'node', 'git', 'npx'],
			denyPaths: [],
			...policy
		},
		runId: 'terminal-test'
	}
}

describe('Terminal Integration: Command Execution', () => {
	it('should execute allowed commands and return output', async () => {
		const { provider, commandLog } = createMockProvider()
		const context = createContext({}, provider)

		const result = await terminalRunTool.execute({ command: 'npm', args: ['version'] }, context)

		expect(result.success).toBe(true)
		expect(result.data?.output).toBe('10.0.0')
		expect(result.data?.exitCode).toBe(0)
		expect(commandLog).toHaveLength(1)
		expect(commandLog[0].command).toBe('npm')
	})

	it('should execute multiple commands in sequence', async () => {
		const { provider, commandLog } = createMockProvider()
		const context = createContext({}, provider)

		// Execute several commands
		await terminalRunTool.execute({ command: 'npm', args: ['install'] }, context)
		await terminalRunTool.execute({ command: 'npm', args: ['run', 'build'] }, context)
		await terminalRunTool.execute({ command: 'npm', args: ['test'] }, context)

		expect(commandLog).toHaveLength(3)
		expect(commandLog[0].args).toEqual(['install'])
		expect(commandLog[1].args).toEqual(['run', 'build'])
		expect(commandLog[2].args).toEqual(['test'])
	})

	it('should deny commands not in allowlist', async () => {
		const { provider } = createMockProvider()
		const context = createContext({ commandAllowlist: ['npm'] }, provider)

		const result = await terminalRunTool.execute({ command: 'rm', args: ['-rf', '/'] }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('COMMAND_DENIED')
	})
})

describe('Terminal Integration: Argument Policies', () => {
	it('should block dangerous eval arguments', async () => {
		const { provider } = createMockProvider()
		const context = createContext(
			{
				commandAllowlist: ['node'],
				commandArgPolicy: {
					disallow: [{ command: 'node', argsPrefix: ['-e', '--eval'] }]
				}
			},
			provider
		)

		const result = await terminalRunTool.execute({ command: 'node', args: ['-e', 'process.exit(1)'] }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('COMMAND_DENIED')
	})

	it('should require approval for npm run', async () => {
		const { provider } = createMockProvider()
		const context = createContext(
			{
				autoApprove: false,
				commandAllowlist: ['npm'],
				commandArgPolicy: {
					requireApproval: [{ command: 'npm', argsPrefix: ['run'] }]
				}
			},
			provider
		)

		const result = await terminalRunTool.execute({ command: 'npm', args: ['run', 'build'] }, context)

		expect(result.success).toBe(false)
		expect(result.requiresApproval).toBe(true)
	})

	it('should auto-approve when policy allows', async () => {
		const { provider } = createMockProvider()
		const context = createContext(
			{
				autoApprove: true,
				commandAllowlist: ['npm'],
				commandArgPolicy: {
					requireApproval: [{ command: 'npm', argsPrefix: ['run'] }]
				}
			},
			provider
		)

		const result = await terminalRunTool.execute({ command: 'npm', args: ['run', 'build'] }, context)

		expect(result.success).toBe(true)
		expect(result.data?.output).toBe('Build successful!')
	})
})

describe('Terminal Integration: Streaming Execution', () => {
	it('should stream command output and return chunk count', async () => {
		const { provider } = createMockProvider()
		const context = createContext({}, provider)

		const result = await terminalRunStreamTool.execute({ command: 'npm', args: ['install'] }, context)

		expect(result.success).toBe(true)
		// Output has chunkCount (number of chunks) and output (concatenated text)
		expect(result.data?.chunkCount).toBeGreaterThan(0)
		expect(result.data?.output).toBeDefined()
	})

	it('should collect all output in order', async () => {
		const { provider } = createMockProvider()
		const context = createContext({}, provider)

		const result = await terminalRunStreamTool.execute({ command: 'npm', args: ['test'] }, context)

		expect(result.success).toBe(true)
		// The output should contain all the chunks concatenated
		expect(result.data?.output).toContain('Starting npm')
		expect(result.data?.output).toContain('Done!')
	})

	it('should include exit code in stream result', async () => {
		const { provider } = createMockProvider()
		const context = createContext({}, provider)

		const result = await terminalRunStreamTool.execute({ command: 'npm', args: ['version'] }, context)

		expect(result.success).toBe(true)
		expect(result.data?.exitCode).toBe(0)
		expect(result.data?.command).toBe('npm')
		expect(result.data?.args).toEqual(['version'])
	})
})

describe('Terminal Integration: Session Management', () => {
	it('should start sessions with command and args', async () => {
		const { provider, sessions } = createMockProvider()
		const context = createContext({}, provider)

		// Start session - uses command/args, not shell
		const startResult = await terminalSessionStartTool.execute({ command: 'npm', args: ['run', 'dev'] }, context)

		expect(startResult.success).toBe(true)
		expect(startResult.data?.sessionId).toBeDefined()
		expect(startResult.data?.command).toBe('npm')
		expect(startResult.data?.args).toEqual(['run', 'dev'])

		const sessionId = startResult.data!.sessionId
		expect(sessions.get(sessionId)?.active).toBe(true)
	})

	it('should stop running sessions', async () => {
		const { provider, sessions } = createMockProvider()
		const context = createContext({}, provider)

		// Start session
		const startResult = await terminalSessionStartTool.execute({ command: 'node', args: ['server.js'] }, context)
		const sessionId = startResult.data!.sessionId
		expect(sessions.get(sessionId)?.active).toBe(true)

		// Stop session
		const stopResult = await terminalSessionStopTool.execute({ sessionId }, context)

		expect(stopResult.success).toBe(true)
		expect(stopResult.data?.sessionId).toBe(sessionId)
		expect(stopResult.data?.stopped).toBe(true)
		expect(sessions.get(sessionId)?.active).toBe(false)
	})

	it('should enforce command policy on session start', async () => {
		const { provider } = createMockProvider()
		const context = createContext({ commandAllowlist: ['npm'] }, provider)

		// Try to start a session with disallowed command
		const result = await terminalSessionStartTool.execute({ command: 'python', args: ['malicious.py'] }, context)

		expect(result.success).toBe(false)
		expect(result.errorCode).toBe('COMMAND_DENIED')
	})
})

describe('Terminal Integration: Combined Workflows', () => {
	it('should support npm install -> build -> test workflow', async () => {
		const { provider, commandLog } = createMockProvider()
		const context = createContext({}, provider)

		// Install dependencies
		const installResult = await terminalRunTool.execute({ command: 'npm', args: ['install'] }, context)
		expect(installResult.success).toBe(true)

		// Build
		const buildResult = await terminalRunTool.execute({ command: 'npm', args: ['run', 'build'] }, context)
		expect(buildResult.success).toBe(true)

		// Test
		const testResult = await terminalRunTool.execute({ command: 'npm', args: ['test'] }, context)
		expect(testResult.success).toBe(true)

		// Verify execution order
		expect(commandLog.map((c) => c.args[0])).toEqual(['install', 'run', 'test'])
	})

	it('should support git workflow', async () => {
		const { provider } = createMockProvider()
		const context = createContext({ commandAllowlist: ['git'] }, provider)

		const statusResult = await terminalRunTool.execute({ command: 'git', args: ['status'] }, context)

		expect(statusResult.success).toBe(true)
		expect(statusResult.data?.output).toContain('On branch main')
	})

	it('should start dev server and then stop it', async () => {
		const { provider, sessions } = createMockProvider()
		const context = createContext({}, provider)

		// Start dev server
		const startResult = await terminalSessionStartTool.execute({ command: 'npm', args: ['run', 'dev'] }, context)
		expect(startResult.success).toBe(true)
		const sessionId = startResult.data!.sessionId

		// Verify session is running
		expect(sessions.get(sessionId)?.active).toBe(true)

		// Stop dev server
		const stopResult = await terminalSessionStopTool.execute({ sessionId }, context)
		expect(stopResult.success).toBe(true)

		// Verify session stopped
		expect(sessions.get(sessionId)?.active).toBe(false)
	})
})

describe('Terminal Integration: Error Handling', () => {
	it('should handle command not found gracefully', async () => {
		const { provider } = createMockProvider()
		// Override to simulate error
		provider.run = jest.fn(async () => {
			throw new Error('Command not found: foobar')
		}) as any

		const context = createContext({ commandAllowlist: ['foobar'] }, provider)

		const result = await terminalRunTool.execute({ command: 'foobar', args: [] }, context)

		expect(result.success).toBe(false)
		expect(result.error).toContain('Command')
	})

	it('should handle non-zero exit codes', async () => {
		const { provider } = createMockProvider()
		provider.run = jest.fn(async () => ({
			exitCode: 1,
			output: 'Build failed!',
			stderr: 'Error: Missing dependency'
		})) as any

		const context = createContext({}, provider)

		const result = await terminalRunTool.execute({ command: 'npm', args: ['run', 'build'] }, context)

		// Non-zero exit is still "success" from tool perspective
		// (command executed, just failed)
		expect(result.success).toBe(true)
		expect(result.data?.exitCode).toBe(1)
		expect(result.data?.output).toBe('Build failed!')
	})

	it('should handle session stop on non-existent session', async () => {
		const { provider } = createMockProvider()
		const context = createContext({}, provider)

		// Try to stop a session that doesn't exist
		const result = await terminalSessionStopTool.execute({ sessionId: 'non-existent-session' }, context)

		// Should succeed (considered already stopped)
		expect(result.success).toBe(true)
	})
})

describe('Terminal Integration: Policy Combinations', () => {
	it('should enforce both allowlist and arg policies', async () => {
		const { provider } = createMockProvider()
		const context = createContext(
			{
				commandAllowlist: ['node', 'npm'],
				commandArgPolicy: {
					disallow: [
						{ command: 'node', argsPrefix: ['-e'] },
						{ command: 'npm', argsPrefix: ['publish'] }
					]
				}
			},
			provider
		)

		// Allowed command with allowed args
		const r1 = await terminalRunTool.execute({ command: 'node', args: ['index.js'] }, context)
		expect(r1.success).toBe(true)

		// Allowed command with disallowed args
		const r2 = await terminalRunTool.execute({ command: 'node', args: ['-e', 'code'] }, context)
		expect(r2.success).toBe(false)

		// Disallowed command entirely
		const r3 = await terminalRunTool.execute({ command: 'rm', args: ['-rf'] }, context)
		expect(r3.success).toBe(false)

		// Allowed command with specifically disallowed arg
		const r4 = await terminalRunTool.execute({ command: 'npm', args: ['publish'] }, context)
		expect(r4.success).toBe(false)
	})
})
