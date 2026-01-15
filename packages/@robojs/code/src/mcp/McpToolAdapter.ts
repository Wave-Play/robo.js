/**
 * MCP Tool Adapter for @robojs/code SDK
 *
 * Converts MCP tools (from @ai-sdk/mcp) to SDK ToolDefinition format
 * for registration in the ToolRegistry. Handles:
 * - Schema conversion from JSON Schema to Zod (passthrough)
 * - Metadata attachment for event attribution (serverId)
 * - Remote server patch-plan rule enforcement
 * - ProposedChanges validation for remote tools
 */

import { z } from 'zod'
import { codeLogger } from '../core/logger.js'
import type { ToolDefinition, ToolContext, ToolResult } from '../tools/types.js'
import type { ProposedChanges, FileChange } from '../types/changes.js'
import type { McpToolMetadata, McpRemoteToolResult } from './types.js'
import type { McpToolDefinition } from './McpClientManager.js'

/**
 * Options for adapting MCP tools
 */
export interface McpToolAdapterOptions {
	/**
	 * Timeout for tool execution (ms)
	 */
	toolTimeout?: number

	/**
	 * Prefix to add to tool names (to avoid collisions with core tools)
	 */
	namePrefix?: string
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<McpToolAdapterOptions> = {
	toolTimeout: 60000,
	namePrefix: '' // MCP tools already have serverId prefix from McpClientManager
}

/**
 * Adapt an MCP tool to SDK ToolDefinition format
 */
export function adaptMcpTool(
	mcpTool: McpToolDefinition,
	options: McpToolAdapterOptions = {}
): ToolDefinition<unknown, unknown> {
	const opts = { ...DEFAULT_OPTIONS, ...options }
	const toolName = opts.namePrefix ? `${opts.namePrefix}${mcpTool.name}` : mcpTool.name

	// Create a permissive Zod schema from JSON Schema
	// MCP tools already validate on their side, so we just pass through
	const schema = createZodSchemaFromJsonSchema(mcpTool.inputSchema)

	const tool: ToolDefinition<unknown, unknown> = {
		name: toolName,
		description: mcpTool.description,
		schema,
		mutates: false, // MCP tools don't directly mutate (remote uses patch-plan)
		requiresApproval: mcpTool.metadata.isRemote, // Remote tools require approval for changes

		execute: async (input: unknown, context: ToolContext): Promise<ToolResult<unknown>> => {
			const startTime = Date.now()

			try {
				// Check for abort
				if (context.signal?.aborted) {
					return {
						success: false,
						error: 'Tool execution aborted',
						errorCode: 'ABORTED',
						recoverable: false
					}
				}

				// Execute with timeout
				const timeoutPromise = new Promise<never>((_, reject) => {
					setTimeout(
						() => reject(new Error(`MCP tool '${mcpTool.name}' timed out after ${opts.toolTimeout}ms`)),
						opts.toolTimeout
					)
				})

				const result = await Promise.race([mcpTool.execute(input), timeoutPromise])

				const duration = Date.now() - startTime
				codeLogger.debug(`MCP tool '${mcpTool.name}' completed in ${duration}ms`)

				// Handle remote tool results (patch-plan rule)
				if (mcpTool.metadata.isRemote) {
					return handleRemoteToolResult(result, mcpTool.metadata)
				}

				// Local MCP tool - return result directly
				return {
					success: true,
					data: result
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				codeLogger.error(`MCP tool '${mcpTool.name}' failed: ${errorMessage}`)

				return {
					success: false,
					error: errorMessage,
					errorCode: 'MCP_TOOL_ERROR',
					recoverable: true
				}
			}
		}
	}

	// Attach metadata for event attribution
	// This is read by the StreamAdapter to emit mcp_call/mcp_result events
	;(tool as any).metadata = mcpTool.metadata

	return tool
}

/**
 * Handle result from a remote MCP tool (patch-plan rule)
 * Remote tools cannot modify files directly - they return proposed changes
 */
function handleRemoteToolResult(result: unknown, metadata: McpToolMetadata): ToolResult<unknown> {
	// Try to parse as McpRemoteToolResult
	const remoteResult = result as McpRemoteToolResult

	// If there are proposed changes, require approval
	if (remoteResult.proposedChanges) {
		const changes = validateProposedChanges(remoteResult.proposedChanges)

		if (!changes) {
			return {
				success: false,
				error: 'Remote MCP tool returned invalid proposed changes',
				errorCode: 'INVALID_PROPOSED_CHANGES',
				recoverable: false
			}
		}

		return {
			success: false, // Not successful until changes are approved and applied
			requiresApproval: true,
			pendingChanges: changes,
			approvalReason: remoteResult.notes || `Changes proposed by MCP tool from '${metadata.serverId}'`
		}
	}

	// No proposed changes - return data directly
	return {
		success: true,
		data: remoteResult.data ?? result
	}
}

/**
 * Validate proposed changes from a remote MCP tool
 */
function validateProposedChanges(proposed: ProposedChanges): FileChange[] | null {
	if (!proposed.changes || !Array.isArray(proposed.changes)) {
		return null
	}

	const validChanges: FileChange[] = []

	for (const change of proposed.changes) {
		if (!change.path || typeof change.path !== 'string') {
			codeLogger.warn('Invalid proposed change: missing or invalid path')
			continue
		}

		if (!['create', 'modify', 'delete'].includes(change.type)) {
			codeLogger.warn(`Invalid proposed change type: ${change.type}`)
			continue
		}

		if (change.type !== 'delete' && typeof change.content !== 'string') {
			codeLogger.warn(`Invalid proposed change: missing content for ${change.type}`)
			continue
		}

		validChanges.push({
			path: change.path,
			type: change.type,
			content: change.content
		} as FileChange)
	}

	return validChanges.length > 0 ? validChanges : null
}

/**
 * Create a Zod schema from JSON Schema
 *
 * This is a simplified conversion - MCP tools validate on their side,
 * so we primarily need this for LangGraph tool binding.
 */
function createZodSchemaFromJsonSchema(_jsonSchema: Record<string, unknown>): z.ZodSchema {
	// For now, use a passthrough object that accepts any properties
	// MCP tools handle their own validation
	return z.object({}).passthrough()
}

/**
 * Adapt multiple MCP tools
 */
export function adaptMcpTools(mcpTools: McpToolDefinition[], options: McpToolAdapterOptions = {}): ToolDefinition[] {
	return mcpTools.map((tool) => adaptMcpTool(tool, options))
}

/**
 * Register MCP tools to a tool registry
 */
export function registerMcpTools(
	registry: { register: (tool: ToolDefinition) => void },
	mcpTools: McpToolDefinition[],
	options: McpToolAdapterOptions = {}
): void {
	const adapted = adaptMcpTools(mcpTools, options)

	for (const tool of adapted) {
		registry.register(tool)
		codeLogger.debug(`Registered MCP tool: ${tool.name}`)
	}

	codeLogger.info(`Registered ${adapted.length} MCP tool(s)`)
}
