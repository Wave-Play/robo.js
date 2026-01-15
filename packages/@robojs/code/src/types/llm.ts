/**
 * LLM provider types for @robojs/code SDK
 *
 * The SDK uses a proxy-first architecture where:
 * - Browser never holds LLM API keys
 * - All LLM calls go through a backend proxy
 * - Backend enforces rate limits, policies, and model selection
 */

/**
 * Branded model aliases for client-side model selection.
 *
 * These are client-side branding that map to backend models in ascending capability order.
 * The backend is authoritative for actual model selection and enforcement.
 *
 * Capability order (ascending):
 * - Sage: Entry-level capable model
 * - Great Sage: Mid-tier capable model
 * - Raphael: High capability model
 * - Words of the World: Most capable model (highest tier)
 */
export type BrandedModelAlias = 'Sage' | 'Great Sage' | 'Raphael' | 'Words of the World'

/**
 * Configuration for the LLM provider
 */
export interface LLMProviderConfig {
	/** URL of the LLM proxy endpoint */
	proxyUrl: string

	/** Optional headers for authentication */
	headers?: Record<string, string>

	/** Branded model alias (client-side preference, backend authoritative) */
	modelAlias?: BrandedModelAlias

	/** Raw provider model ID (e.g., "openai/gpt-4", "anthropic/claude-3") */
	modelId?: string

	/**
	 * Client-side hints for desired capabilities.
	 * These are suggestions only; backend enforces actual limits.
	 */
	hints?: {
		maxOutputTokens?: number
		maxContextTokens?: number
	}
}

/**
 * Message role in a chat conversation
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

/**
 * A message in the chat conversation
 */
export interface ChatMessage {
	role: MessageRole
	content: string | ChatMessageContent[]
	name?: string
	toolCallId?: string
	toolCalls?: ToolCall[]
}

/**
 * Content block in a message (for multimodal support)
 */
export type ChatMessageContent = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }

/**
 * Tool call from the model
 */
export interface ToolCall {
	id: string
	type: 'function'
	function: {
		name: string
		arguments: string // JSON string
	}
}

/**
 * Tool schema for model binding
 */
export interface ToolSchema {
	type: 'function'
	function: {
		name: string
		description: string
		parameters: Record<string, unknown> // JSON Schema
	}
}

/**
 * Request to the LLM provider
 */
export interface ChatRequest {
	messages: ChatMessage[]
	tools?: ToolSchema[]
	toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } }
	temperature?: number
	maxTokens?: number
	stop?: string[]

	/**
	 * Per-request model alias override
	 * Takes precedence over provider default
	 */
	modelAlias?: BrandedModelAlias

	/**
	 * Per-request model ID override
	 * Takes precedence over modelAlias and provider default
	 */
	modelId?: string
}

/**
 * Response from the LLM provider (non-streaming)
 */
export interface ChatResponse {
	id: string
	content: string
	toolCalls?: ToolCall[]
	finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter'
	usage?: {
		promptTokens: number
		completionTokens: number
		totalTokens: number
	}
	model?: string // Resolved model ID from backend
}

/**
 * Streaming chunk from the LLM provider
 */
export interface StreamChunk {
	type: 'text' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_end' | 'done'
	text?: string
	toolCallId?: string
	toolName?: string
	toolArgsDelta?: string
	finishReason?: 'stop' | 'tool_calls' | 'length' | 'content_filter'
	usage?: {
		promptTokens: number
		completionTokens: number
		totalTokens: number
	}
}

/**
 * The LLM provider interface for chat completions.
 *
 * This is a proxy-first interface - implementations should call the backend
 * proxy rather than LLM APIs directly (browser safety requirement).
 */
export interface LLMProvider {
	/**
	 * Send a chat request and receive a complete response
	 */
	chat(request: ChatRequest): Promise<ChatResponse>

	/**
	 * Send a chat request and stream the response
	 */
	stream(request: ChatRequest): AsyncIterable<StreamChunk>
}
