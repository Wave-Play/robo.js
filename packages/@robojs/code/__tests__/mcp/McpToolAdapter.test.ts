/**
 * Tests for McpToolAdapter
 *
 * Verifies:
 * - MCP tools are correctly adapted to SDK ToolDefinition format
 * - Metadata is attached for event attribution
 * - Remote tool results are handled with patch-plan rule
 * - ProposedChanges validation works correctly
 */

import { jest } from '@jest/globals'
import { adaptMcpTool, adaptMcpTools, registerMcpTools } from '../../src/mcp/McpToolAdapter.js'
import type { McpToolDefinition } from '../../src/mcp/McpClientManager.js'
import type { ToolContext } from '../../src/tools/types.js'
import type { AgentPolicy } from '../../src/types/policy.js'

// Helper to create a valid policy
function createPolicy(): AgentPolicy {
	return {
		autoApprove: false,
		maxIterations: 10,
		commandAllowlist: ['npm', 'node'],
		denyPaths: ['.env']
	}
}

// Helper to create a mock execute function with proper typing
const mockExecute = (returnValue: unknown = { result: 'success' }) =>
	jest.fn(async () => returnValue) as unknown as (args: unknown) => Promise<unknown>

describe('McpToolAdapter', () => {
	const createMockMcpTool = (overrides?: Partial<McpToolDefinition>): McpToolDefinition => ({
		name: 'test-server__test-tool',
		description: 'A test tool',
		inputSchema: {
			type: 'object',
			properties: {
				message: { type: 'string' }
			}
		},
		metadata: {
			serverId: 'test-server',
			isRemote: false,
			originalName: 'test-tool'
		},
		execute: mockExecute(),
		...overrides
	})

	const createMockContext = (): ToolContext => ({
		provider: {} as any,
		policy: createPolicy(),
		runId: 'test-run-123'
	})

	describe('adaptMcpTool', () => {
		it('should adapt MCP tool to SDK ToolDefinition format', () => {
			const mcpTool = createMockMcpTool()
			const adapted = adaptMcpTool(mcpTool)

			expect(adapted.name).toBe('test-server__test-tool')
			expect(adapted.description).toBe('A test tool')
			expect(adapted.schema).toBeDefined()
			expect(typeof adapted.execute).toBe('function')
		})

		it('should attach metadata to adapted tool', () => {
			const mcpTool = createMockMcpTool()
			const adapted = adaptMcpTool(mcpTool)

			// Metadata is attached as a non-enumerable property
			expect((adapted as any).metadata).toEqual({
				serverId: 'test-server',
				isRemote: false,
				originalName: 'test-tool'
			})
		})

		it('should apply name prefix if provided', () => {
			const mcpTool = createMockMcpTool()
			const adapted = adaptMcpTool(mcpTool, { namePrefix: 'mcp_' })

			expect(adapted.name).toBe('mcp_test-server__test-tool')
		})

		it('should set requiresApproval for remote tools', () => {
			const mcpTool = createMockMcpTool({
				metadata: {
					serverId: 'remote-server',
					isRemote: true,
					originalName: 'remote-tool'
				}
			})
			const adapted = adaptMcpTool(mcpTool)

			expect(adapted.requiresApproval).toBe(true)
		})

		it('should not set requiresApproval for local tools', () => {
			const mcpTool = createMockMcpTool()
			const adapted = adaptMcpTool(mcpTool)

			expect(adapted.requiresApproval).toBe(false)
		})
	})

	describe('tool execution', () => {
		it('should execute local MCP tool and return success', async () => {
			const mcpTool = createMockMcpTool({
				execute: mockExecute({ data: 'test-result' })
			})
			const adapted = adaptMcpTool(mcpTool)
			const context = createMockContext()

			const result = await adapted.execute({ message: 'hello' }, context)

			expect(result.success).toBe(true)
			expect(result.data).toEqual({ data: 'test-result' })
		})

		it('should handle tool execution errors', async () => {
			const mockRejectExecute = jest.fn(async () => {
				throw new Error('Tool failed')
			}) as unknown as (args: unknown) => Promise<unknown>
			const mcpTool = createMockMcpTool({
				execute: mockRejectExecute
			})
			const adapted = adaptMcpTool(mcpTool)
			const context = createMockContext()

			const result = await adapted.execute({ message: 'hello' }, context)

			expect(result.success).toBe(false)
			expect(result.error).toBe('Tool failed')
			expect(result.errorCode).toBe('MCP_TOOL_ERROR')
			expect(result.recoverable).toBe(true)
		})

		it('should handle abort signal', async () => {
			const mcpTool = createMockMcpTool()
			const adapted = adaptMcpTool(mcpTool)

			const abortController = new AbortController()
			abortController.abort()

			const context: ToolContext = {
				...createMockContext(),
				signal: abortController.signal
			}

			const result = await adapted.execute({ message: 'hello' }, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('ABORTED')
			expect(result.recoverable).toBe(false)
		})

		it('should handle remote tool with proposed changes', async () => {
			const mcpTool = createMockMcpTool({
				metadata: {
					serverId: 'remote-server',
					isRemote: true,
					originalName: 'remote-tool'
				},
				execute: mockExecute({
					proposedChanges: {
						changes: [{ path: '/src/test.ts', type: 'create', content: 'console.log("test")' }]
					}
					// No notes - so approvalReason falls back to serverId-based message
				})
			})
			const adapted = adaptMcpTool(mcpTool)
			const context = createMockContext()

			const result = await adapted.execute({}, context)

			expect(result.success).toBe(false) // Not successful until approved
			expect(result.requiresApproval).toBe(true)
			expect(result.pendingChanges).toHaveLength(1)
			expect(result.pendingChanges?.[0].path).toBe('/src/test.ts')
			expect(result.approvalReason).toContain('remote-server')
		})

		it('should handle remote tool with no proposed changes', async () => {
			const mcpTool = createMockMcpTool({
				metadata: {
					serverId: 'remote-server',
					isRemote: true,
					originalName: 'remote-tool'
				},
				execute: mockExecute({
					data: { info: 'some data' }
				})
			})
			const adapted = adaptMcpTool(mcpTool)
			const context = createMockContext()

			const result = await adapted.execute({}, context)

			expect(result.success).toBe(true)
			expect(result.data).toEqual({ info: 'some data' })
		})

		it('should reject invalid proposed changes', async () => {
			const mcpTool = createMockMcpTool({
				metadata: {
					serverId: 'remote-server',
					isRemote: true,
					originalName: 'remote-tool'
				},
				execute: mockExecute({
					proposedChanges: {
						changes: [
							{ type: 'create', content: 'missing path' } // Invalid: missing path
						]
					}
				})
			})
			const adapted = adaptMcpTool(mcpTool)
			const context = createMockContext()

			const result = await adapted.execute({}, context)

			expect(result.success).toBe(false)
			expect(result.errorCode).toBe('INVALID_PROPOSED_CHANGES')
		})
	})

	describe('adaptMcpTools', () => {
		it('should adapt multiple MCP tools', () => {
			const tools = [
				createMockMcpTool({ name: 'server1__tool1' }),
				createMockMcpTool({ name: 'server1__tool2' }),
				createMockMcpTool({ name: 'server2__tool1' })
			]

			const adapted = adaptMcpTools(tools)

			expect(adapted).toHaveLength(3)
			expect(adapted.map((t) => t.name)).toEqual(['server1__tool1', 'server1__tool2', 'server2__tool1'])
		})

		it('should apply options to all tools', () => {
			const tools = [createMockMcpTool({ name: 'tool1' }), createMockMcpTool({ name: 'tool2' })]

			const adapted = adaptMcpTools(tools, { namePrefix: 'mcp_' })

			expect(adapted.map((t) => t.name)).toEqual(['mcp_tool1', 'mcp_tool2'])
		})
	})

	describe('registerMcpTools', () => {
		it('should register all MCP tools to registry', () => {
			const mockRegistry = {
				register: jest.fn()
			}

			const tools = [createMockMcpTool({ name: 'tool1' }), createMockMcpTool({ name: 'tool2' })]

			registerMcpTools(mockRegistry, tools)

			expect(mockRegistry.register).toHaveBeenCalledTimes(2)
		})

		it('should apply adapter options when registering', () => {
			const mockRegistry = {
				register: jest.fn()
			}

			const tools = [createMockMcpTool({ name: 'tool1' })]

			registerMcpTools(mockRegistry, tools, { namePrefix: 'mcp_' })

			expect(mockRegistry.register).toHaveBeenCalledWith(expect.objectContaining({ name: 'mcp_tool1' }))
		})
	})
})
