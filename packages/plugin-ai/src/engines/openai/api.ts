import { options as pluginOptions } from '@/events/_start.js'
import { logger } from '@roboplay/robo.js'

/**
 * API bindings for OpenAI.
 * @see https://platform.openai.com/docs/api-reference
 */
export const openai = {
	chat,
	createImage
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
	const {
		backoff = true,
		functions,
		maxTokens = 1024,
		messages,
		model = 'gpt-3.5-turbo',
		retries = 3
	} = options
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

interface Assistant {
	id: string
	object: string
	created_at: number
	name: string
	description: string | null
	model: string
	instructions: string
	tools: Array<{
		type: string
	}>
	file_ids: string[]
	metadata: Record<string, unknown>
}

interface CreateAssistantOptions {
	model: string
	name?: string
}

interface CreateImageOptions {
	prompt: string
	model?: string
	n?: number
	quality?: string
	response_format?: string
	size?: string
	style?: string
	user?: string
}

interface CreateImageResult {
	created: number
	data: Array<{
		url: string
	}>
}

async function createImage(options: CreateImageOptions): Promise<CreateImageResult> {
	if (!pluginOptions.openaiKey) {
		throw new Error('OpenAI key not found, please set it via plugin options.')
	}

	const response = await fetch('https://api.openai.com/v1/images/generations', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${pluginOptions.openaiKey}`
		},
		body: JSON.stringify(options)
	})

	const jsonResponse = await response.json()
	if (jsonResponse.error) {
		throw new Error(jsonResponse.error.message)
	}

	if (!response.ok) {
		throw new Error(`HTTP Error status code: ${response.status}`)
	}

	return jsonResponse
}
