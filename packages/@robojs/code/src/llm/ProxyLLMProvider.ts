/**
 * Proxy LLM provider for @robojs/code SDK
 *
 * Production LLM provider that calls a backend proxy.
 * The browser never holds LLM API keys - all calls go through the proxy.
 */

import type { LLMProvider, LLMProviderConfig, ChatRequest, ChatResponse, StreamChunk, ToolCall } from '../types/llm.js'
import { codeLogger } from '../core/logger.js'

/**
 * ProxyLLMProvider - production LLM provider using backend proxy
 *
 * Usage:
 * ```ts
 * const llm = new ProxyLLMProvider({
 *   proxyUrl: 'https://api.example.com/llm',
 *   headers: { Authorization: 'Bearer token' },
 *   modelAlias: 'Great Sage'
 * })
 * ```
 */
export class ProxyLLMProvider implements LLMProvider {
	private readonly proxyUrl: string
	private readonly headers: Record<string, string>
	private readonly modelAlias?: string
	private readonly modelId?: string
	private readonly hints?: { maxOutputTokens?: number; maxContextTokens?: number }

	constructor(config: LLMProviderConfig) {
		this.proxyUrl = config.proxyUrl
		this.headers = config.headers ?? {}
		this.modelAlias = config.modelAlias
		this.modelId = config.modelId
		this.hints = config.hints
	}

	/**
	 * Send a chat request and receive a complete response
	 */
	async chat(request: ChatRequest): Promise<ChatResponse> {
		const url = `${this.proxyUrl}/chat`

		const body = this.buildRequestBody(request)

		codeLogger.debug('[LLM] Sending chat request', {
			endpoint: url,
			messageCount: request.messages.length,
			toolCount: request.tools?.length ?? 0,
			modelAlias: this.modelAlias,
			modelId: this.modelId
		})

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...this.headers
			},
			credentials: 'include',
			body: JSON.stringify(body)
		})

		if (!response.ok) {
			const error = await response.text()
			throw new Error(`LLM proxy error: ${response.status} - ${error}`)
		}

		const data = (await response.json()) as Record<string, unknown>

		const parsed = this.parseResponse(data)

		codeLogger.debug('[LLM] Chat response received', {
			model: parsed.model,
			contentLength: parsed.content?.length ?? 0,
			toolCalls: parsed.toolCalls?.length ?? 0,
			finishReason: parsed.finishReason,
			toolNames: parsed.toolCalls?.map((tc) => tc.function.name)
		})

		return parsed
	}

	/**
	 * Send a chat request and stream the response
	 *
	 * Expects the proxy to return NDJSON (one JSON object per line).
	 */
	async *stream(request: ChatRequest): AsyncIterable<StreamChunk> {
		const url = `${this.proxyUrl}/stream`

		const body = this.buildRequestBody(request)

		codeLogger.debug('[LLM] Sending stream request', {
			endpoint: url,
			messageCount: request.messages.length,
			toolCount: request.tools?.length ?? 0,
			modelAlias: this.modelAlias,
			modelId: this.modelId
		})

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...this.headers
			},
			credentials: 'include',
			body: JSON.stringify(body)
		})

		if (!response.ok) {
			const error = await response.text()
			throw new Error(`LLM proxy error: ${response.status} - ${error}`)
		}

		if (!response.body) {
			throw new Error('LLM proxy returned empty body')
		}

		// Parse NDJSON stream
		const reader = response.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ''

		try {
			while (true) {
				const { done, value } = await reader.read()

				if (done) {
					break
				}

				buffer += decoder.decode(value, { stream: true })

				// Process complete lines
				const lines = buffer.split('\n')
				buffer = lines.pop() ?? '' // Keep incomplete line in buffer

				for (const line of lines) {
					const trimmed = line.trim()
					if (!trimmed) continue

					try {
						const chunk = JSON.parse(trimmed) as StreamChunk
						yield chunk
					} catch (e) {
						codeLogger.warn('Failed to parse stream chunk:', trimmed)
					}
				}
			}

			// Process any remaining buffer
			if (buffer.trim()) {
				try {
					const chunk = JSON.parse(buffer.trim()) as StreamChunk
					yield chunk
				} catch (e) {
					codeLogger.warn('Failed to parse final stream chunk:', buffer)
				}
			}
		} finally {
			reader.releaseLock()
		}
	}

	/**
	 * Build the request body for the proxy
	 */
	private buildRequestBody(request: ChatRequest): Record<string, unknown> {
		// Per-request values take precedence over provider defaults
		const effectiveModelAlias = request.modelAlias ?? this.modelAlias
		const effectiveModelId = request.modelId ?? this.modelId

		codeLogger.debug('[LLM] Building request body', {
			requestModelAlias: request.modelAlias,
			providerModelAlias: this.modelAlias,
			effectiveModelAlias
		})

		return {
			messages: request.messages,
			tools: request.tools,
			toolChoice: request.toolChoice,
			temperature: request.temperature,
			maxTokens: request.maxTokens,
			stop: request.stop,
			// Client-side hints (backend is authoritative)
			modelAlias: effectiveModelAlias,
			modelId: effectiveModelId,
			hints: this.hints
		}
	}

	/**
	 * Parse the response from the proxy
	 */
	private parseResponse(data: Record<string, unknown>): ChatResponse {
		// Handle tool_calls if present
		let toolCalls: ToolCall[] | undefined
		if (Array.isArray(data.toolCalls)) {
			toolCalls = data.toolCalls.map((tc: Record<string, unknown>) => ({
				id: String(tc.id),
				type: 'function' as const,
				function: {
					name: String((tc.function as Record<string, unknown>)?.name ?? ''),
					arguments: String((tc.function as Record<string, unknown>)?.arguments ?? '{}')
				}
			}))
		}

		// Handle usage if present
		let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined
		if (data.usage && typeof data.usage === 'object') {
			const u = data.usage as Record<string, unknown>
			usage = {
				promptTokens: Number(u.promptTokens ?? u.prompt_tokens ?? 0),
				completionTokens: Number(u.completionTokens ?? u.completion_tokens ?? 0),
				totalTokens: Number(u.totalTokens ?? u.total_tokens ?? 0)
			}
		}

		return {
			id: String(data.id ?? ''),
			content: String(data.content ?? ''),
			toolCalls,
			finishReason: (data.finishReason ?? data.finish_reason ?? 'stop') as ChatResponse['finishReason'],
			usage,
			model: data.model as string | undefined
		}
	}
}

/**
 * Create a proxy LLM provider
 */
export function createProxyLLMProvider(config: LLMProviderConfig): ProxyLLMProvider {
	return new ProxyLLMProvider(config)
}
