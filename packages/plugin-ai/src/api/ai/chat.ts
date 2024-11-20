import { AI } from '@/core/ai.js'
import { logger } from '@/core/logger.js'
import { options as pluginOptions } from '@/events/_start.js'
import type { ChatMessage } from '@/engines/base.js'
import type { RoboRequest } from '@robojs/server'

interface ApiChatRequest {
	functionCall?: string
	messages: ChatMessage[]
	model?: string
}

interface ApiChatResponse {
	message: string
}

export default (req: RoboRequest): Promise<ApiChatResponse> => {
	return new Promise((resolve, reject) => {
		const run = async () => {
			const { messages } = (await req.json()) as ApiChatRequest
			if (!messages?.length) {
				return reject('No message provided')
			}

			// Only insert system message if none already provided & exists
			const gptMessages = messages
			const systemMessage = gptMessages.find((message) => message.role === 'system')

			if (!systemMessage && pluginOptions.systemMessage) {
				gptMessages.unshift({
					content: pluginOptions.systemMessage,
					role: 'system'
				})
			}

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
