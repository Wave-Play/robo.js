import { logger } from '@/core/logger.js'
import { hasProperties } from '@/utils/other-utils.js'
import { FormData } from 'formdata-node'
import { color } from 'robo.js'
import { Assistant, type AssistantData } from '@/engines/openai/assistant.js'
import type { File, Message, Run, Thread } from './types.js'

/**
 * API bindings for OpenAI.
 * @see https://platform.openai.com/docs/api-reference
 */
export const openai = {
	cancelRun,
	chat,
	createAssistant,
	createImage,
	createMessage,
	createRun,
	createThread,
	deleteFile,
	getAssistant,
	getRun,
	getThread,
	getThreadMessages,
	listAssistants,
	listFiles,
	listRuns,
	modifyAssistant,
	uploadFile
}

interface RequestOptions {
	apiKey?: string
	backoff?: boolean
	body?: unknown
	headers?: Record<string, string>
	method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
	query?: Record<string, unknown>
	retries?: number
}

/**
 * Calls the OpenAI chat endpoint.
 *
 * @param options The chat options.
 * @returns The chat response.
 */
async function request<T = unknown>(urlPath: string, options: RequestOptions): Promise<T> {
	const {
		apiKey = process.env.OPENAI_API_KEY,
		backoff = true,
		body,
		headers,
		method = 'GET',
		query,
		retries = 3
	} = options
	let retryCount = 0

	if (!apiKey) {
		throw new Error('OpenAI API key not found, please set it as an environment variable called OPENAI_API_KEY.')
	}

	let queryString = ''
	if (query) {
		const normalizedQuery: Record<string, string> = {}
		Object.entries(query).forEach(([key, value]) => {
			if (value !== undefined) {
				normalizedQuery[key] = String(value)
			}
		})
		queryString = '?' + new URLSearchParams(normalizedQuery).toString()
	}

	while (retryCount <= retries) {
		try {
			const extraHeaders: Record<string, string> = {}
			let requestBody
			if (body instanceof FormData) {
				requestBody = body as BodyInit
			} else if (body) {
				requestBody = JSON.stringify(body)
				extraHeaders['Content-Type'] = 'application/json'
			}
			const response = await fetch('https://api.openai.com/v1' + urlPath + queryString, {
				method: method,
				headers: {
					Authorization: `Bearer ${apiKey}`,
					...extraHeaders,
					...(headers ?? {})
				},
				body: requestBody
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

interface SplitOptionsResult<T extends RequestOptions> {
	bodyOptions: Omit<T, keyof RequestOptions>
	requestOptions: RequestOptions
}
function splitOptions<T extends RequestOptions>(options?: T): SplitOptionsResult<T> {
	const { apiKey, backoff, body, headers, method, retries, ...rest } = options ?? {}

	return {
		bodyOptions: rest as Omit<T, keyof RequestOptions>,
		requestOptions: { apiKey, backoff, body, headers, method, retries }
	}
}

interface CancelRunOptions extends RequestOptions {
	run_id: string
	thread_id: string
}
async function cancelRun(options: CancelRunOptions) {
	const { requestOptions } = splitOptions(options)

	return request<unknown>(`/threads/${options.thread_id}/runs/${options.run_id}/cancel`, {
		...requestOptions,
		method: 'POST',
		headers: {
			'OpenAI-Beta': 'assistants=v1'
		}
	})
}

async function chat(options: GptChatOptions) {
	const { bodyOptions, requestOptions } = splitOptions(options)
	const { functions, max_tokens = 1024, messages, model = 'gpt-3.5-turbo', temperature = 0 } = bodyOptions

	return request<ChatResult>('/chat/completions', {
		...requestOptions,
		method: 'POST',
		body: {
			functions: functions?.length && !model.includes('vision') ? functions : undefined,
			max_tokens: max_tokens,
			messages: messages,
			model: model,
			temperature: temperature
		}
	})
}

interface CreateAssistantOptions extends RequestOptions {
	description?: string | null
	file_ids?: string[]
	instructions?: string
	metadata?: Record<string, string>
	model: string
	name?: string
	tools?: Array<{
		function?: {
			description?: string
			name: string
			parameters: GptFunctionParameters
		}
		type: 'code_interpreter' | 'function' | 'retrieval'
	}>
}

async function createAssistant(options: CreateAssistantOptions) {
	const { bodyOptions, requestOptions } = splitOptions(options)

	const assistantData = await request<AssistantData>('/assistants', {
		...requestOptions,
		headers: {
			'OpenAI-Beta': 'assistants=v1'
		},
		method: 'POST',
		body: bodyOptions
	})
	return new Assistant(assistantData)
}

async function createImage(options: CreateImageOptions) {
	const { bodyOptions, requestOptions } = splitOptions(options)

	return request<CreateImageResult>('/images/generations', {
		...requestOptions,
		method: 'POST',
		body: bodyOptions
	})
}

interface CreateMessageOptions extends RequestOptions {
	thread_id: string
	role: 'user'
	content: string
	file_ids?: string[]
	metadata?: Record<string, string>
}
async function createMessage(options: CreateMessageOptions) {
	const { bodyOptions, requestOptions } = splitOptions(options)
	const { thread_id, ...rest } = bodyOptions

	return request<Message>('/threads/' + thread_id + '/messages', {
		...requestOptions,
		method: 'POST',
		headers: {
			'OpenAI-Beta': 'assistants=v1'
		},
		body: rest
	})
}

interface CreateRunOptions extends RequestOptions {
	assistant_id: string
	thread_id: string
	model?: string
	instructions?: string
	tools?: Array<{
		function?: {
			description?: string
			name: string
			parameters: GptFunctionParameters
		}
		type: 'code_interpreter' | 'function' | 'retrieval'
	}>
	metadata?: Record<string, string>
}
async function createRun(options: CreateRunOptions) {
	const { bodyOptions, requestOptions } = splitOptions(options)
	const { thread_id, ...rest } = bodyOptions

	return request<Run>('/threads/' + thread_id + '/runs', {
		...requestOptions,
		method: 'POST',
		headers: {
			'OpenAI-Beta': 'assistants=v1'
		},
		body: rest
	})
}

export interface CreateThreadOptions extends RequestOptions {
	messages?: Array<{
		role: 'user'
		content: string
		file_ids?: string[]
		metadata?: Record<string, string>
	}>
	metadata?: Record<string, string>
}
async function createThread(options: CreateThreadOptions) {
	const { bodyOptions, requestOptions } = splitOptions(options)

	logger.debug(`Creating ${color.bold('thread')} with options:`, bodyOptions)
	return request<Thread>('/threads', {
		...requestOptions,
		method: 'POST',
		headers: {
			'OpenAI-Beta': 'assistants=v1'
		},
		body: bodyOptions
	})
}

interface DeleteFileOptions extends RequestOptions {
	file_id: string
}
async function deleteFile(options: DeleteFileOptions) {
	const { requestOptions } = splitOptions(options)

	return request<unknown>(`/files/${options.file_id}`, {
		...requestOptions,
		method: 'DELETE'
	})
}

interface GetAssistantOptions extends RequestOptions {
	assistant_id: string
}
async function getAssistant(options: GetAssistantOptions) {
	const { requestOptions } = splitOptions(options)

	const assistantData = await request<AssistantData>(`/assistants/${options.assistant_id}`, {
		...requestOptions,
		headers: {
			'OpenAI-Beta': 'assistants=v1'
		}
	})
	return new Assistant(assistantData)
}

interface GetRunOptions extends RequestOptions {
	run_id: string
	thread_id: string
}
async function getRun(options: GetRunOptions) {
	const { requestOptions } = splitOptions(options)

	return request<Run>(`/threads/${options.thread_id}/runs/${options.run_id}`, {
		...requestOptions,
		headers: {
			'OpenAI-Beta': 'assistants=v1'
		}
	})
}

interface GetThreadOptions extends RequestOptions {
	thread_id: string
}
async function getThread(options: GetThreadOptions) {
	const { requestOptions } = splitOptions(options)

	return request<Thread>(`/threads/${options.thread_id}`, {
		...requestOptions,
		headers: {
			'OpenAI-Beta': 'assistants=v1'
		}
	})
}

interface GetThreadMessagesOptions extends RequestOptions {
	thread_id: string
	limit?: number
	order?: 'asc' | 'desc'
	after?: string
	before?: string
}
interface GetThreadMessagesResult {
	object: 'list'
	data: Message[]
	first_id: string
	has_more: boolean
	last_id: string
}
async function getThreadMessages(options: GetThreadMessagesOptions) {
	const { bodyOptions, requestOptions } = splitOptions(options)
	const { thread_id, ...rest } = bodyOptions

	return request<GetThreadMessagesResult>(`/threads/${thread_id}/messages`, {
		...requestOptions,
		headers: {
			'OpenAI-Beta': 'assistants=v1'
		},
		query: rest
	})
}

interface ListAssistantsOptions extends RequestOptions {
	after?: string
	before?: string
	limit?: number
	order?: 'asc' | 'desc'
}

interface ListResult<T> {
	data: T[]
	first_id: string
	has_more: boolean
	last_id: string
	object: string
}

async function listAssistants(options?: ListAssistantsOptions) {
	const { requestOptions } = splitOptions(options)

	const assistantData = await request<ListResult<AssistantData>>(`/assistants`, {
		...requestOptions,
		headers: {
			'OpenAI-Beta': 'assistants=v1'
		}
	})
	return assistantData.data.map((data) => new Assistant(data))
}

interface ListFilesOptions extends RequestOptions {
	purpose?: string
}

async function listFiles(options?: ListFilesOptions) {
	const { bodyOptions, requestOptions } = splitOptions(options)
	const { purpose } = bodyOptions

	const query = purpose ? `?purpose=${purpose}` : ''
	return request<ListResult<File>>(`/files${query}`, {
		...requestOptions
	})
}

interface ListRunsOptions extends RequestOptions {
	thread_id: string
}

async function listRuns(options?: ListRunsOptions) {
	const { bodyOptions, requestOptions } = splitOptions(options)
	const { thread_id } = bodyOptions

	return request<ListResult<Run>>(`/threads/${thread_id}/runs`, {
		...requestOptions,
		headers: {
			'OpenAI-Beta': 'assistants=v1'
		}
	})
}

interface ModifyAssistantOptions extends CreateAssistantOptions {
	assistant_id: string
}
async function modifyAssistant(options: ModifyAssistantOptions) {
	const { bodyOptions, requestOptions } = splitOptions(options)
	const { assistant_id, ...rest } = bodyOptions

	const assistantData = await request<AssistantData>(`/assistants/${assistant_id}`, {
		...requestOptions,
		headers: {
			'OpenAI-Beta': 'assistants=v1'
		},
		method: 'POST',
		body: rest
	})
	return new Assistant(assistantData)
}

interface UploadFileOptions extends RequestOptions {
	file: Blob
	fileName: string
	purpose: string
}
async function uploadFile(options: UploadFileOptions) {
	const { bodyOptions, requestOptions } = splitOptions(options)
	const { file, fileName, purpose } = bodyOptions
	const formData = new FormData()
	formData.set('file', file, fileName)
	formData.set('purpose', purpose)

	//return uploadFileTest()
	return request<File>(`/files`, {
		...requestOptions,
		method: 'POST',
		body: formData
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

interface GptChatOptions extends RequestOptions {
	functions?: GptFunction[]
	max_tokens?: number
	messages: GptChatMessage[]
	model?: string
	temperature?: number
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

interface ChatResult {
	choices: Array<{
		finish_reason: string
		index: number
		message: GptChatMessage
	}>
}

interface CreateImageOptions extends RequestOptions {
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
