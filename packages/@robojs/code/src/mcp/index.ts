/**
 * MCP (Model Context Protocol) integration for @robojs/code SDK
 *
 * This module provides MCP client integration via @ai-sdk/mcp.
 * Uses browser-compatible HTTP transport that works in WebContainers.
 *
 * Features:
 * - WebContainer-first: HTTP and SSE transports only (no stdio)
 * - Local MCP servers with URL discovery via LocalServiceDiscovery
 * - Remote MCP servers via backend gateway with auth headers
 * - MCP tools registered with same serialization + policy as core tools
 * - Remote patch-plan rule: remote tools return ProposedChanges
 *
 * @example
 * ```typescript
 * import { createMcpClientManager, registerMcpTools } from '@robojs/code/mcp'
 *
 * const mcpManager = createMcpClientManager({
 *   config: {
 *     enabled: true,
 *     servers: {
 *       roboLocal: {
 *         transport: 'http',
 *         url: '__DISCOVERED__',
 *         startCommand: { command: 'node', args: ['mcp-server.js'] }
 *       }
 *     }
 *   },
 *   provider,
 *   serviceDiscovery
 * })
 *
 * await mcpManager.connect()
 * const tools = mcpManager.getTools()
 * registerMcpTools(toolRegistry, tools)
 * ```
 */

// Types
export type {
	McpTransport,
	McpServerConfig,
	McpConfig,
	McpToolMetadata,
	McpRemoteToolResult,
	McpServerStatus,
	McpServerInfo
} from './types.js'

export { DISCOVERED_URL, DEFAULT_MCP_CONFIG } from './types.js'

// Client Manager
export {
	McpClientManager,
	createMcpClientManager,
	type McpClientManagerOptions,
	type McpToolDefinition
} from './McpClientManager.js'

// Tool Adapter
export { adaptMcpTool, adaptMcpTools, registerMcpTools, type McpToolAdapterOptions } from './McpToolAdapter.js'
