import { BaseEngine, ChatMessage, ChatOptions, ChatResult } from './base.js'
import { gptFunctions, options as pluginOptions } from '@/events/_start.js'
import { logger } from '@roboplay/robo.js'

export class OpenAiEngine extends BaseEngine {
	public async chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResult> {
		const { functions, model = pluginOptions?.model ?? 'gpt-3.5-turbo' } = options ?? {}

		const response = await chat({
			maxTokens: pluginOptions?.maxTokens,
			model: model,
			messages: messages,
			functions: functions
		})
		logger.debug(`GPT Response:`, response)

		const reply = response?.choices?.[0]
		return {
			finish_reason: reply?.finish_reason,
			message: reply?.message
		}
	}
}

interface GptChatMessage {
	content: GptChatMessageContent
	function_call?: GptFunctionCall
	name?: string
	role: 'assistant' | 'function' | 'system' | 'user'
}

type GptChatMessageContentObject = {
	image_url?: string
	text?: string
	type: 'image_url' | 'text'
}

type GptChatMessageContent = string | GptChatMessageContentObject[]

interface GptChatOptions {
	backoff?: boolean
	functions?: GptFunction[]
	maxTokens?: number
	messages: GptChatMessage[]
	model?: string
	retries?: number
}

interface GptFunction {
	name: string
	description: string
	parameters: GptFunctionParameters
}

interface GptFunctionParameters {
	properties: Record<string, GptFunctionProperty>
	required?: string[]
	type?: 'array' | 'object'
}

interface GptFunctionCall {
	name: string
	arguments: Record<string, string>
}

interface GptFunctionProperty {
	description?: string
	enum?: string[]
	items?: GptFunctionProperty
	type: 'array' | 'string'
}

async function chat(options: GptChatOptions) {
	const { backoff = true, functions = gptFunctions, maxTokens = 1024, messages, model = 'gpt-3.5-turbo', retries = 3 } = options
	let retryCount = 0

	if (!pluginOptions.openaiKey) {
		throw new Error('OpenAI key not found, please set it via plugin options.')
	}

	while (retryCount <= retries) {
		try {
			const response = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${pluginOptions.openaiKey}`
				},
				body: JSON.stringify({
					functions: functions?.length && !model.includes('vision') ? functions : undefined,
					max_tokens: maxTokens,
					messages: messages,
					model: model
				})
			})

			const jsonResponse = await response.json()
			if (jsonResponse.error) {
				throw new Error(jsonResponse.error.message)
			}

			if (!response.ok) {
				throw new Error(`HTTP Error status code: ${response.status}`)
			}

			return jsonResponse
		} catch (error) {
			if (retryCount === retries) {
				logger.error(error)
				return null
			}

			logger.debug(`Error calling GPT:`, error)
			if (backoff) {
				// Wait for 2^retryCount * 1000 ms (exponential backoff)
				logger.warn(`Retrying in ${2 ** retryCount * 4000}ms...`)
				await new Promise((r) => setTimeout(r, 2 ** retryCount * 4000))
			} else {
				logger.warn('Retrying...')
			}

			retryCount++
		}
	}
}
