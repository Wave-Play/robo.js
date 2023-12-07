import { logger } from '@/core/logger.js'
import { hasProperties } from '@/utils/other-utils.js'

/**
 * API bindings for OpenAI.
 * @see https://platform.openai.com/docs/api-reference
 */
export const openai = {
	chat,
	createImage
}

interface RequestOptions {
	apiKey?: string
	backoff?: boolean
	body?: unknown
	method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
	retries?: number
}

/**
 * Calls the OpenAI chat endpoint.
 *
 * @param options The chat options.
 * @returns The chat response.
 */
async function request<T = unknown>(urlPath: string, options: RequestOptions): Promise<T> {
	const { apiKey = process.env.OPENAI_API_KEY, backoff = true, body, method = 'GET', retries = 3 } = options
	let retryCount = 0

	if (!apiKey) {
		throw new Error('OpenAI API key not found, please set it as an environment variable called OPENAI_API_KEY.')
	}

	while (retryCount <= retries) {
		try {
			const response = await fetch('https://api.openai.com/v1' + urlPath, {
				method: method,
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${apiKey}`
				},
				body: body ? JSON.stringify(body) : undefined
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
			// Throw error if we've reached the max number of retries
			if (retryCount === retries) {
				logger.error(error)
				throw error
			}

			// Wait for 2^retryCount * 1000 ms (exponential backoff)
			const delay = backoff ? 2 ** retryCount * 1000 : 1000
			const message = hasProperties<{ message: string }>(error, ['message']) ? error.message + ' - ' : ''
			logger.debug(error)
			logger.warn(`${message}Retrying in ${delay}ms...`)
			await new Promise((r) => setTimeout(r, delay))

			retryCount++
		}
	}

	throw new Error('Failed to call OpenAI API')
}

async function chat(options: GptChatOptions) {
	const { functions, max_tokens = 1024, messages, model = 'gpt-3.5-turbo' } = options

	return request<ChatResult>('/chat/completions', {
		method: 'POST',
		body: {
			functions: functions?.length && !model.includes('vision') ? functions : undefined,
			max_tokens: max_tokens,
			messages: messages,
			model: model
		}
	})
}

async function createImage(options: CreateImageOptions) {
	return request<CreateImageResult>('/images/generations', {
		method: 'POST',
		body: options
	})
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
	functions?: GptFunction[]
	max_tokens?: number
	messages: GptChatMessage[]
	model?: string
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

interface ChatResult {
	choices: Array<{
		finish_reason: string
		index: number
		message: GptChatMessage
	}>
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
