/**
 * Token counter for @robojs/code SDK
 *
 * Uses js-tiktoken for accurate token counting with the cl100k_base encoding,
 * which is compatible with Claude and GPT-4 models.
 */

import { getEncoding, type Tiktoken } from 'js-tiktoken'
import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import type { ToolSchema } from '../tools/types.js'

/**
 * Lazy-loaded encoder instance.
 * Initialized on first use to avoid startup overhead.
 */
let encoder: Tiktoken | null = null

/**
 * Get or create the tiktoken encoder.
 * Uses cl100k_base encoding which is compatible with Claude and GPT-4.
 */
function getEncoder(): Tiktoken {
	if (!encoder) {
		encoder = getEncoding('cl100k_base')
	}
	return encoder
}

/**
 * Count tokens in a string using the actual tokenizer.
 */
export function countTokens(text: string): number {
	if (!text) return 0
	return getEncoder().encode(text).length
}

/**
 * Count tokens for a single message.
 * Includes role overhead and handles different content formats.
 */
export function countMessageTokens(message: BaseMessage): number {
	let tokens = 0

	// Role overhead (approximately 4 tokens per message for role/structure)
	tokens += 4

	// Content tokens
	const content = message.content
	if (typeof content === 'string') {
		tokens += countTokens(content)
	} else if (Array.isArray(content)) {
		for (const block of content) {
			if (typeof block === 'string') {
				tokens += countTokens(block)
			} else if (typeof block === 'object' && block !== null && 'text' in block) {
				tokens += countTokens(String(block.text))
			}
		}
	}

	// Tool call overhead for AI messages
	if (message instanceof AIMessage && message.tool_calls) {
		for (const tc of message.tool_calls) {
			// Function name + structure overhead
			tokens += 10
			tokens += countTokens(tc.name)
			// Arguments
			const argsStr = typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args)
			tokens += countTokens(argsStr)
		}
	}

	// Tool message has additional metadata
	if (message instanceof ToolMessage) {
		// tool_call_id overhead
		tokens += 5
		if (message.name) {
			tokens += countTokens(message.name)
		}
	}

	return tokens
}

/**
 * Count total tokens for an array of messages.
 */
export function countMessagesTokens(messages: BaseMessage[]): number {
	let total = 0
	for (const msg of messages) {
		total += countMessageTokens(msg)
	}
	// Conversation structure overhead
	total += 10
	return total
}

/**
 * Count tokens for a system prompt.
 */
export function countSystemPromptTokens(prompt: string): number {
	// System prompt content + role overhead
	return countTokens(prompt) + 4
}

/**
 * Count tokens for tool schemas.
 */
export function countToolSchemasTokens(schemas: ToolSchema[]): number {
	let total = 0
	for (const schema of schemas) {
		// Function definition overhead
		total += 10
		// Name
		total += countTokens(schema.name)
		// Description
		if (schema.description) {
			total += countTokens(schema.description)
		}
		// Parameters JSON schema
		if (schema.parameters) {
			total += countTokens(JSON.stringify(schema.parameters))
		}
	}
	return total
}

/**
 * Context token count breakdown
 */
export interface ContextTokenCount {
	/**
	 * Tokens in the system prompt
	 */
	systemPromptTokens: number

	/**
	 * Tokens in all messages
	 */
	messagesTokens: number

	/**
	 * Tokens in tool schemas
	 */
	toolSchemaTokens: number

	/**
	 * Total tokens (sum of all components)
	 */
	totalTokens: number
}

/**
 * Count total context tokens before an LLM call.
 * This gives an accurate picture of how much context is being used.
 */
export function countContextTokens(
	systemPrompt: string,
	messages: BaseMessage[],
	toolSchemas: ToolSchema[]
): ContextTokenCount {
	const systemPromptTokens = countSystemPromptTokens(systemPrompt)
	const messagesTokens = countMessagesTokens(messages)
	const toolSchemaTokens = countToolSchemasTokens(toolSchemas)

	return {
		systemPromptTokens,
		messagesTokens,
		toolSchemaTokens,
		totalTokens: systemPromptTokens + messagesTokens + toolSchemaTokens
	}
}

/**
 * Free the encoder resources.
 * Call this when you're done using the token counter to free memory.
 */
export function freeEncoder(): void {
	// js-tiktoken's public Tiktoken type does not expose a `free()` API.
	// Clearing the reference allows the encoder to be garbage-collected.
	encoder = null
}
