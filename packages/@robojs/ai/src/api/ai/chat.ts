/** API endpoint for executing chat requests via the AI engine. */
import { AI } from '@/core/ai.js'
import { logger } from '@/core/logger.js'
import { options as pluginOptions } from '@/events/_start.js'
import type { ChatMessage } from '@/engines/base.js'
import type { RoboRequest } from '@robojs/server'

interface ApiChatRequest {
	/** Optional function call identifier used by the client. */
	functionCall?: string
	/** Messages composing the chat request. */
	messages: ChatMessage[]
	/** Optional model override. */
	model?: string
}

interface ApiChatResponse {
	/** Text produced by the AI engine. */
	message: string
}

/**
 * Handles POST requests to the chat API, validating messages, injecting system instructions, and
 * executing the AI chat pipeline.
 */
export default (req: RoboRequest): Promise<ApiChatResponse> => {
	return new Promise((resolve, reject) => {
		const run = async () => {
			// Parse request body
			const { messages } = (await req.json()) as ApiChatRequest

			// Validate request contains messages
			if (!messages?.length) {
				return reject('No message provided')
			}

			// Only insert system message if none already provided & exists
			const gptMessages = messages
			const systemMessage = gptMessages.find((message) => message.role === 'system')

			// Inject system instructions if not already present
			if (!systemMessage && pluginOptions.instructions) {
				gptMessages.unshift({
					content: pluginOptions.instructions,
					role: 'system'
				})
			}

			// Execute chat and resolve with first reply
			AI.chat(gptMessages, {
				onReply: (message) => {
					logger.debug('API Chat response:', message)
					resolve({
						message: message.text ?? ''
					})
				}
			})
		}

		run()
	})
}
