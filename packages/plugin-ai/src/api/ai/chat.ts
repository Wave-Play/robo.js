import { GptChatMessage } from '../../core/openai.js'
import { AiEngine } from '../../index.js'
import type { RoboRequest } from '@roboplay/plugin-api'

interface ApiChatResponse {
	message: string
}

export default (req: RoboRequest): Promise<ApiChatResponse> => {
	return new Promise((resolve, reject) => {
		const message = req.body.message as string
		if (!message) {
			return reject('No message provided')
		}

		const gptMessages: GptChatMessage[] = [
			{
				content: message,
				role: 'user'
			}
		]

		AiEngine.chat(gptMessages, {
			onReply: (message) => {
				resolve({
					message: message
				})
			}
		})
	})
}
