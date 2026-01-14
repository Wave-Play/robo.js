/**
 * Mock LLM provider for @robojs/code SDK
 *
 * Provides deterministic, queue-based responses for testing.
 * Use this to test agent behavior without calling real LLM APIs.
 */

import type { LLMProvider, ChatRequest, ChatResponse, StreamChunk, ToolCall } from '../types/llm.js'

/**
 * Mock response configuration
 */
export interface MockResponse {
	/**
	 * Text content of the response
	 */
	content: string

	/**
	 * Optional tool calls to include
	 */
	toolCalls?: Array<{
		name: string
		arguments: Record<string, unknown>
	}>

	/**
	 * Finish reason (auto-detected from toolCalls if not specified)
	 */
	finishReason?: 'stop' | 'tool_calls' | 'length' | 'content_filter'

	/**
	 * Simulated delay in milliseconds
	 */
	delayMs?: number
}

/**
 * MockLLMProvider - deterministic LLM for testing
 *
 * Usage:
 * ```ts
 * const mock = new MockLLMProvider()
 *
 * // Add responses that will be returned in order
 * mock.addResponse({ content: "I'll help you with that." })
 * mock.addResponse({
 *   content: "",
 *   toolCalls: [{ name: "fs_read", arguments: { path: "/file.ts" } }]
 * })
 *
 * // Use in tests
 * const agent = new CodeAgent({ llm: mock, ... })
 * ```
 */
export class MockLLMProvider implements LLMProvider {
	private responses: MockResponse[] = []
	private callIndex = 0
	private callHistory: ChatRequest[] = []

	/**
	 * Add a response to the queue
	 */
	addResponse(response: MockResponse): void {
		this.responses.push(response)
	}

	/**
	 * Add multiple responses at once
	 */
	addResponses(responses: MockResponse[]): void {
		this.responses.push(...responses)
	}

	/**
	 * Set all responses (replaces existing)
	 */
	setResponses(responses: MockResponse[]): void {
		this.responses = [...responses]
		this.callIndex = 0
	}

	/**
	 * Get call history for assertions
	 */
	getCallHistory(): ChatRequest[] {
		return [...this.callHistory]
	}

	/**
	 * Get the number of calls made
	 */
	getCallCount(): number {
		return this.callHistory.length
	}

	/**
	 * Get a specific call from history
	 */
	getCall(index: number): ChatRequest | undefined {
		return this.callHistory[index]
	}

	/**
	 * Get the last call made
	 */
	getLastCall(): ChatRequest | undefined {
		return this.callHistory[this.callHistory.length - 1]
	}

	/**
	 * Reset the mock (clears history and response queue)
	 */
	reset(): void {
		this.responses = []
		this.callIndex = 0
		this.callHistory = []
	}

	/**
	 * Reset only the call history (keeps responses)
	 */
	resetHistory(): void {
		this.callHistory = []
	}

	/**
	 * Reset response queue to beginning (keeps history)
	 */
	resetResponseQueue(): void {
		this.callIndex = 0
	}

	/**
	 * Check if there are more responses available
	 */
	hasMoreResponses(): boolean {
		return this.callIndex < this.responses.length
	}

	/**
	 * Get remaining response count
	 */
	getRemainingResponseCount(): number {
		return this.responses.length - this.callIndex
	}

	/**
	 * Send a chat request and receive a complete response
	 */
	async chat(request: ChatRequest): Promise<ChatResponse> {
		this.callHistory.push(request)

		if (this.callIndex >= this.responses.length) {
			throw new Error(
				`MockLLMProvider: No response configured for call ${this.callIndex}. ` +
					`Add more responses with addResponse() or setResponses().`
			)
		}

		const mockResponse = this.responses[this.callIndex++]

		// Simulate delay if configured
		if (mockResponse.delayMs && mockResponse.delayMs > 0) {
			await sleep(mockResponse.delayMs)
		}

		// Build tool calls
		const toolCalls: ToolCall[] | undefined = mockResponse.toolCalls?.map((tc, i) => ({
			id: `mock_tool_${this.callHistory.length}_${i}`,
			type: 'function' as const,
			function: {
				name: tc.name,
				arguments: JSON.stringify(tc.arguments)
			}
		}))

		// Determine finish reason
		const finishReason = mockResponse.finishReason ?? (toolCalls && toolCalls.length > 0 ? 'tool_calls' : 'stop')

		return {
			id: `mock_response_${this.callHistory.length}`,
			content: mockResponse.content,
			toolCalls,
			finishReason,
			usage: {
				promptTokens: this.estimateTokens(request),
				completionTokens: this.estimateTokens({ messages: [{ content: mockResponse.content }] }),
				totalTokens: 0 // Will be summed
			},
			model: 'mock-model'
		}
	}

	/**
	 * Send a chat request and stream the response
	 */
	async *stream(request: ChatRequest): AsyncIterable<StreamChunk> {
		const response = await this.chat(request)

		// Stream content character by character
		if (response.content) {
			for (const char of response.content) {
				yield { type: 'text', text: char }
			}
		}

		// Stream tool calls
		if (response.toolCalls) {
			for (const tc of response.toolCalls) {
				yield {
					type: 'tool_call_start',
					toolCallId: tc.id,
					toolName: tc.function.name
				}
				yield {
					type: 'tool_call_delta',
					toolCallId: tc.id,
					toolArgsDelta: tc.function.arguments
				}
				yield { type: 'tool_call_end', toolCallId: tc.id }
			}
		}

		yield {
			type: 'done',
			finishReason: response.finishReason,
			usage: response.usage
		}
	}

	/**
	 * Rough token estimation for mock responses
	 */
	private estimateTokens(request: { messages?: Array<{ content?: string | unknown[] }> }): number {
		let chars = 0
		for (const msg of request.messages ?? []) {
			if (typeof msg.content === 'string') {
				chars += msg.content.length
			}
		}
		// Rough estimate: 4 chars per token
		return Math.ceil(chars / 4)
	}
}

/**
 * Helper to create a mock provider with preset responses
 */
export function createMockLLMProvider(responses?: MockResponse[]): MockLLMProvider {
	const provider = new MockLLMProvider()
	if (responses) {
		provider.setResponses(responses)
	}
	return provider
}

/**
 * Helper to create common mock responses
 */
export const MockResponses = {
	/**
	 * Simple text response
	 */
	text(content: string): MockResponse {
		return { content }
	},

	/**
	 * Alias for text - simple text response
	 */
	simple(content: string): MockResponse {
		return { content }
	},

	/**
	 * Response with a single tool call
	 */
	toolCall(name: string, args: Record<string, unknown>): MockResponse {
		return {
			content: '',
			toolCalls: [{ name, arguments: args }]
		}
	},

	/**
	 * Response with multiple tool calls
	 */
	toolCalls(calls: Array<{ name: string; arguments: Record<string, unknown> }>): MockResponse {
		return {
			content: '',
			toolCalls: calls
		}
	},

	/**
	 * Response with multiple tool calls (alias with ToolCall type)
	 */
	withToolCalls(calls: Array<{ name: string; args: Record<string, unknown> }>): MockResponse {
		return {
			content: '',
			toolCalls: calls.map((c) => ({ name: c.name, arguments: c.args }))
		}
	},

	/**
	 * Text response followed by tool call
	 */
	textAndTool(content: string, name: string, args: Record<string, unknown>): MockResponse {
		return {
			content,
			toolCalls: [{ name, arguments: args }]
		}
	},

	/**
	 * fs_read tool call
	 */
	fsRead(path: string): MockResponse {
		return {
			content: '',
			toolCalls: [{ name: 'fs_read', arguments: { path } }]
		}
	},

	/**
	 * fs_write tool call
	 */
	fsWrite(path: string, content: string): MockResponse {
		return {
			content: '',
			toolCalls: [{ name: 'fs_write', arguments: { path, content } }]
		}
	},

	/**
	 * terminal_run tool call
	 */
	terminalRun(command: string, args?: string[]): MockResponse {
		return {
			content: '',
			toolCalls: [{ name: 'terminal_run', arguments: { command, args: args ?? [] } }]
		}
	},

	/**
	 * Completion response (signals task done)
	 */
	done(summary: string): MockResponse {
		return { content: summary }
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
