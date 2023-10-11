import { logger } from './logger.js'
import { options as pluginOptions } from '../events/_start.js'

export interface GptChatMessage {
	content: string
	function_call?: GptFunctionCall
	name?: string
	role: 'assistant' | 'function' | 'system' | 'user'
}

export interface GptChatOptions {
	backoff?: boolean
	functions?: GptFunction[]
	messages: GptChatMessage[]
	model?: string
	retries?: number
}

export interface GptFunction {
	name: string
	description: string
	parameters: GptFunctionParameters
}

export interface GptFunctionParameters {
	properties: Record<string, GptFunctionProperty>
	required?: string[]
	type?: 'array' | 'object'
}

export interface GptFunctionCall {
	name: string
	arguments: Record<string, string>
}

export interface GptFunctionProperty {
	description?: string
	enum?: string[]
	items?: GptFunctionProperty
	type: 'array' | 'string'
}

export async function chat(options: GptChatOptions) {
	const { backoff = true, functions, messages, model = 'gpt-3.5-turbo', retries = 3 } = options
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
					functions: functions?.length ? functions : undefined,
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
