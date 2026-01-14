/**
 * MCP Client Manager for @robojs/code SDK
 *
 * Manages connections to MCP servers using @ai-sdk/mcp.
 * Supports:
 * - Local MCP servers with URL discovery via LocalServiceDiscovery
 * - Remote MCP servers via backend gateway with auth headers
 * - Tool loading and lifecycle management
 *
 * Uses one client per server (AI SDK pattern) with manual tool name prefixing.
 */

import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp'
import { codeLogger } from '../core/logger.js'
import type { ExecutionProvider, LocalServiceDiscovery } from '../types/execution.js'
import type {
	McpConfig,
	McpServerConfig,
	McpServerInfo,
	McpServerStatus,
	McpToolMetadata,
	DISCOVERED_URL
} from './types.js'

/**
 * AI SDK MCP Client type (inferred from createMCPClient return)
 */
type AiSdkMcpClient = Awaited<ReturnType<typeof createMCPClient>>

/**
 * Tool definition from MCP server
 */
export interface McpToolDefinition {
	/**
	 * Tool name (prefixed with serverId for uniqueness: serverId__toolName)
	 */
	name: string

	/**
	 * Tool description
	 */
	description: string

	/**
	 * JSON Schema for tool parameters
	 */
	inputSchema: Record<string, unknown>

	/**
	 * Metadata for event attribution
	 */
	metadata: McpToolMetadata

	/**
	 * Execute the tool
	 */
	execute: (args: unknown) => Promise<unknown>
}

/**
 * Options for McpClientManager
 */
export interface McpClientManagerOptions {
	/**
	 * MCP configuration
	 */
	config: McpConfig

	/**
	 * Execution provider for starting local MCP servers
	 */
	provider: ExecutionProvider

	/**
	 * Optional service discovery for local MCP URLs
	 */
	serviceDiscovery?: LocalServiceDiscovery

	/**
	 * Abort signal for cleanup
	 */
	signal?: AbortSignal
}

/**
 * Manages MCP server connections and tool loading
 *
 * Uses one AI SDK MCP client per server, with tools prefixed by serverId
 * for namespace isolation (format: serverId__toolName).
 */
export class McpClientManager {
	private readonly config: McpConfig
	private readonly provider: ExecutionProvider
	private readonly serviceDiscovery?: LocalServiceDiscovery
	private readonly signal?: AbortSignal

	private clients: Map<string, AiSdkMcpClient> = new Map()
	private serverInfoMap: Map<string, McpServerInfo> = new Map()
	private tools: Map<string, McpToolDefinition> = new Map()
	private localSessions: Map<string, string> = new Map() // serverId -> sessionId

	constructor(options: McpClientManagerOptions) {
		this.config = options.config
		this.provider = options.provider
		this.serviceDiscovery = options.serviceDiscovery
		this.signal = options.signal
	}

	/**
	 * Initialize and connect to all configured MCP servers
	 */
	async connect(): Promise<void> {
		const serverEntries = Object.entries(this.config.servers)

		// Auto-enable if servers are defined (unless explicitly disabled)
		const isEnabled = this.config.enabled ?? serverEntries.length > 0

		if (!isEnabled) {
			codeLogger.debug('MCP is disabled, skipping connection')
			return
		}

		if (serverEntries.length === 0) {
			codeLogger.debug('No MCP servers configured')
			return
		}

		codeLogger.info(`Connecting to ${serverEntries.length} MCP server(s)`)

		for (const [serverId, serverConfig] of serverEntries) {
			try {
				this.updateServerStatus(serverId, 'connecting')
				const resolvedUrl = await this.resolveServerUrl(serverId, serverConfig)

				// Map transport type for backwards compatibility
				const transportType = this.mapTransportType(serverConfig.transport)

				// Create AI SDK MCP client for this server
				const client = await createMCPClient({
					name: `robojs-mcp-${serverId}`,
					transport: {
						type: transportType,
						url: resolvedUrl,
						headers: serverConfig.headers
					}
				})

				this.clients.set(serverId, client)
				this.updateServerStatus(serverId, 'connected', { resolvedUrl })
				codeLogger.info(`Connected to MCP server '${serverId}' at ${resolvedUrl}`)
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error)
				this.updateServerStatus(serverId, 'error', { error: errorMessage })
				codeLogger.error(`Failed to connect to MCP server '${serverId}': ${errorMessage}`)
			}
		}

		// Load tools from all connected clients
		await this.loadTools()

		const connectedCount = this.clients.size
		if (connectedCount === 0) {
			codeLogger.warn('No MCP servers connected, MCP will be unavailable')
			return
		}

		codeLogger.info(`MCP connected: ${this.tools.size} tool(s) from ${connectedCount} server(s)`)
	}

	/**
	 * Map transport type for backwards compatibility
	 */
	private mapTransportType(transport: string): 'http' | 'sse' {
		// 'streamable_http' is an alias for 'http' (backwards compatibility)
		if (transport === 'streamable_http' || transport === 'http') {
			return 'http'
		}
		if (transport === 'sse') {
			return 'sse'
		}
		// Default to 'http' for unknown values
		return 'http'
	}

	/**
	 * Resolve server URL (handles discovery for local servers)
	 */
	private async resolveServerUrl(serverId: string, config: McpServerConfig): Promise<string> {
		// If URL is already specified, return it directly
		if (config.url !== '__DISCOVERED__') {
			return config.url
		}

		// Local discovery required
		if (!this.serviceDiscovery) {
			throw new Error(`Server '${serverId}' requires URL discovery but no LocalServiceDiscovery is available`)
		}

		if (!config.startCommand) {
			throw new Error(`Server '${serverId}' requires URL discovery but no startCommand is configured`)
		}

		codeLogger.debug(`Starting local MCP server '${serverId}'...`)

		// Start the local MCP server as a session
		const sessionHandle = await this.provider.startSession(config.startCommand.command, config.startCommand.args, {
			env: config.startCommand.env,
			signal: this.signal
		})

		// Track the session for cleanup
		this.localSessions.set(serverId, sessionHandle.id)

		// Wait for URL discovery
		const { serviceId } = await this.serviceDiscovery.start('mcp', {
			port: config.expectedPort
		})

		const timeout = this.config.connectionTimeout ?? 30000
		const { url } = await Promise.race([
			this.serviceDiscovery.waitForUrl(serviceId),
			new Promise<never>((_, reject) =>
				setTimeout(() => reject(new Error(`Timeout waiting for MCP server '${serverId}'`)), timeout)
			)
		])

		return url
	}

	/**
	 * Load tools from all connected servers
	 */
	private async loadTools(): Promise<void> {
		this.tools.clear()

		for (const [serverId, client] of this.clients) {
			try {
				// Get tools from AI SDK client - returns Record<string, Tool>
				const aiSdkTools = await client.tools()

				for (const [toolName, tool] of Object.entries(aiSdkTools)) {
					const serverConfig = this.config.servers[serverId]
					const isRemote = serverConfig?.isRemote ?? false

					// Create prefixed name for uniqueness (serverId__toolName)
					const prefixedName = `${serverId}__${toolName}`

					const metadata: McpToolMetadata = {
						serverId,
						isRemote,
						originalName: toolName
					}

					const toolDef: McpToolDefinition = {
						name: prefixedName,
						description: tool.description || '',
						inputSchema: (tool.inputSchema as Record<string, unknown>) || {},
						metadata,
						execute: async (args: unknown) => {
							// AI SDK tools have execute(input, options) signature
							if (tool.execute) {
								// Provide minimal required options for tool execution
								return await tool.execute(args as Record<string, unknown>, {
									toolCallId: `mcp-${serverId}-${Date.now()}`,
									messages: []
								})
							}
							throw new Error(`Tool ${toolName} has no execute method`)
						}
					}

					this.tools.set(prefixedName, toolDef)

					// Update server info with tool count
					const info = this.serverInfoMap.get(serverId)
					if (info) {
						info.toolCount = (info.toolCount || 0) + 1
					}
				}
			} catch (error) {
				codeLogger.error(`Failed to load tools from server '${serverId}': ${error}`)
			}
		}
	}

	/**
	 * Get all loaded tools
	 */
	getTools(): McpToolDefinition[] {
		return Array.from(this.tools.values())
	}

	/**
	 * Get a specific tool by name
	 */
	getTool(name: string): McpToolDefinition | undefined {
		return this.tools.get(name)
	}

	/**
	 * Get status of all servers
	 */
	getServerInfos(): McpServerInfo[] {
		return Array.from(this.serverInfoMap.values())
	}

	/**
	 * Get status of a specific server
	 */
	getServerInfo(serverId: string): McpServerInfo | undefined {
		return this.serverInfoMap.get(serverId)
	}

	/**
	 * Check if MCP is connected and has tools
	 */
	isConnected(): boolean {
		return this.clients.size > 0 && this.tools.size > 0
	}

	/**
	 * Disconnect and clean up all MCP connections
	 */
	async disconnect(): Promise<void> {
		codeLogger.debug('Disconnecting MCP clients...')

		// Close all AI SDK clients
		for (const [serverId, client] of this.clients) {
			try {
				await client.close()
				codeLogger.debug(`Closed MCP client for '${serverId}'`)
			} catch (error) {
				codeLogger.warn(`Error closing MCP client '${serverId}': ${error}`)
			}
		}
		this.clients.clear()

		// Stop local MCP server sessions
		for (const [serverId, sessionId] of this.localSessions) {
			try {
				codeLogger.debug(`Stopping local MCP session for '${serverId}'`)
				await this.provider.stopSession({ id: sessionId })
			} catch (error) {
				codeLogger.warn(`Error stopping MCP session '${serverId}': ${error}`)
			}
		}
		this.localSessions.clear()

		// Clear tools and server info
		this.tools.clear()
		for (const [serverId] of this.serverInfoMap) {
			this.updateServerStatus(serverId, 'disconnected')
		}

		codeLogger.info('MCP clients disconnected')
	}

	/**
	 * Update server status and info
	 */
	private updateServerStatus(serverId: string, status: McpServerStatus, extra?: Partial<McpServerInfo>): void {
		const existing = this.serverInfoMap.get(serverId) || {
			serverId,
			status: 'disconnected' as McpServerStatus,
			toolCount: 0
		}

		this.serverInfoMap.set(serverId, {
			...existing,
			status,
			...extra
		})
	}
}

/**
 * Create an MCP client manager
 */
export function createMcpClientManager(options: McpClientManagerOptions): McpClientManager {
	return new McpClientManager(options)
}
