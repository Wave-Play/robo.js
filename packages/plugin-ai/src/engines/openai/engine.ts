import { _PREFIX, packageJson } from '@/core/constants.js'
import { logger } from '@/core/logger.js'
import { BaseEngine } from '@/engines/base.js'
import { CreateThreadOptions, openai } from '@/engines/openai/api.js'
import { options as pluginOptions } from '@/events/_start.js'
import fs from 'node:fs/promises'
import { compare, hasProperties } from '@/utils/other-utils.js'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { Assistant } from '@/engines/openai/assistant.js'
import { Flashcore, color, portal } from '@roboplay/robo.js'
import type {
	ChatFunction,
	ChatFunctionParameters,
	ChatFunctionProperty,
	ChatMessage,
	ChatOptions,
	ChatResult,
	GenerateImageOptions,
	GenerateImageResult
} from '@/engines/base.js'
import type { AssistantData } from '@/engines/openai/assistant.js'
import type { Command } from '@roboplay/robo.js'

const DEFAULT_MODEL = 'gpt-3.5-turbo'

/**
 * AI engine powered by OpenAI.
 * You must have an OpenAI API key in order to use this engine.
 */
export class OpenAiEngine extends BaseEngine {
	private _assistant?: Assistant | null
	private _gptFunctions: ChatFunction[] = []
	private _gptFunctionHandlers: Record<string, Command> = {}

	/**
	 * Prepares the Assistant instance and optimizes commands for GPT Functions.
	 */
	public async init() {
		const { functions, functionHandlers } = await loadFunctions()
		this._gptFunctions = functions
		this._gptFunctionHandlers = functionHandlers
		this._assistant = await loadAssistant()
	}

	public async chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResult> {
		const {
			functions = this._gptFunctions,
			model = pluginOptions?.model ?? DEFAULT_MODEL,
			threadId,
			userId
		} = options ?? {}

		// Use the assistant if it's available
		if (this._assistant && threadId) {
			// Prepare only the most recent message for the thread
			const mostRecentMessage = messages[messages.length - 1]
			const threadMessage: NonNullable<CreateThreadOptions['messages']>[number] = {
				role: 'user' as const,
				content: mostRecentMessage.content as string, // TODO: Account for images
				metadata: userId ? { userId } : undefined
			}

			// Get the prepared thread data
			const { thread, threadCreated } = await this._assistant.thread({ messages, threadId, threadMessage, userId })

			// Add the messages to the thread unless it was just created
			if (!threadCreated) {
				await openai.createMessage({
					...threadMessage,
					thread_id: thread.id
				})
				logger.debug(`Added message to thread "${color.bold(thread.id)}":`, threadMessage)
			}

			// Run the assistant until we get something back!
			logger.debug(
				`Running assistant "${color.bold(this._assistant.data.id)}" for OpenAI thread "${color.bold(thread.id)}"`
			)
			let run = await openai.createRun({
				assistant_id: this._assistant.data.id,
				thread_id: thread.id
			})
			const response = null
			while (['queued', 'in_progress'].includes(run.status)) {
				await new Promise((resolve) => setTimeout(resolve, 400))
				run = await openai.getRun({
					run_id: run.id,
					thread_id: thread.id
				})
				logger.debug(`Run status for "${color.bold(run.id)}":`, run.status)

				if (run.status === 'completed') {
					// TODO: Paginate via "before" cursor + message cache
					const threadMessages = await openai.getThreadMessages({
						thread_id: thread.id,
						limit: 1
					})
					
					const reply = threadMessages?.data?.[0]
					return {
						finish_reason: 'stop', // TODO: Abstract this
						message: {
							role: reply?.role,
							// @ts-expect-error - // TODO: Abstract this
							content: reply?.content?.[0]?.text?.value
						}
					}
				}
			}
			logger.debug(`Assistant response:`, response)
		}

		const response = await openai.chat({
			max_tokens: pluginOptions?.maxTokens,
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

	public async generateImage(options: GenerateImageOptions): Promise<GenerateImageResult> {
		const { model = 'dall-e-3', prompt } = options

		const response = await openai.createImage({
			model,
			prompt
		})
		logger.debug(`GPT Image Response:`, response)

		return {
			images: response?.data
		}
	}

	public getFunctionHandlers(): Record<string, Command> {
		return this._gptFunctionHandlers
	}

	public getInfo() {
		return {
			name: 'OpenAI',
			version: packageJson.version
		}
	}
}

/**
 * Loads an Assistant instance to be used for certain interactions.
 *
 * @returns The Assistant instance, or null if the feature is disabled.
 */
async function loadAssistant(): Promise<Assistant | null | undefined> {
	// No need to load the assistant if Insight feature is disabled
	if (!pluginOptions.insight) {
		logger.debug('Insight is disabled. Skipping assistant initialization.')
		return null
	}

	// Prepare expected assistant data
	const roboPackageJsonFile = await readFile(path.join(process.cwd(), 'package.json'), 'utf-8')
	const roboPackageJson = JSON.parse(roboPackageJsonFile) ?? {}
	const assistantData: Omit<AssistantData, 'created_at' | 'id' | 'object'> = {
		description: roboPackageJson.description ?? '',
		file_ids: [],
		instructions: pluginOptions?.systemMessage ?? '',
		metadata: {
			pluginVersion: packageJson.version,
			roboVersion: roboPackageJson.dependencies?.['@roboplay/robo.js'] ?? 'unknown',
			version: roboPackageJson.version ?? 'unknown'
		},
		model: pluginOptions?.model ?? DEFAULT_MODEL,
		name: roboPackageJson?.name ?? path.basename(process.cwd()),
		tools: []
	}

	// See if we've already created an assistant for this Robo
	let assistant: Assistant | undefined | null = null
	const assistantId = await Flashcore.get<string>('assistantId', {
		namespace: _PREFIX
	})
	if (assistantId) {
		assistant = await openai.getAssistant({ assistant_id: assistantId })
		logger.debug(`Found assistant ${color.bold(assistantId)}:`, assistant)
	}

	// Assistant not found via ID? See if it's in the list of assistants in case Flashcore was reset
	if (!assistant) {
		const assistants = await openai.listAssistants()
		assistant = assistants?.find((assistant) => assistant.data.name === assistantData.name)

		if (assistant) {
			logger.debug(`Found assistant from previous list: ${assistant}`)
		}
	}

	// Still no assistant? Create one!
	if (!assistant) {
		logger.debug(`Creating assistant:`, assistantData)
		assistant = await openai.createAssistant(assistantData)
		logger.info(`Created assistant ${color.bold(assistant.data.id)}`)
	}

	// Set the assistant ID if we didn't already have it
	if (!assistantId) {
		await Flashcore.set('assistantId', assistant.data.id, {
			namespace: _PREFIX
		})
	}

	// Check if the /documents directory has files
	const documentsDir = path.join(process.cwd(), 'documents')
	let documentsExist = false

	try {
		documentsExist = (await fs.stat(documentsDir))?.isDirectory()
	} catch (e) {
		if (hasProperties<{ code: unknown }>(e, ['code']) && e.code !== 'ENOENT') {
			throw e
		}
	}

	// Upload documents if they exist
	if (documentsExist) {
		const documents = await fs.readdir(documentsDir)
		assistantData.tools.push({
			type: 'retrieval'
		})
		logger.debug(`Uploading documents:`, documents)

		await Promise.all(
			documents.map(async (document) => {
				const documentPath = path.join(documentsDir, document)
				const documentData = await fs.readFile(documentPath, 'utf-8')
				const blob = new Blob([documentData])

				const file = await openai.uploadFile({
					purpose: 'assistants',
					file: blob,
					fileName: path.basename(documentPath)
				})
				assistantData.file_ids.push(file.id)
				logger.debug(`Uploaded document ${color.bold(document)}:`, file)
			})
		)
	}

	// Make sure the assistant is up to date on OpenAI's end
	const differences = compare(assistant.data as unknown as Record<string, unknown>, assistantData, [
		'description',
		'file_ids',
		'instructions',
		'metadata',
		'model',
		'name',
		'tools'
	])
	logger.debug(`Found ${differences.length} assistant differences:`, differences)
	if (differences.length > 0) {
		logger.debug(`Updating assistant ${color.bold(assistant.data.id)} with:`, assistantData)
		assistant = await openai.modifyAssistant({
			assistant_id: assistant.data.id,
			description: assistantData.description,
			file_ids: assistantData.file_ids,
			instructions: assistantData.instructions,
			metadata: assistantData.metadata,
			model: assistantData.model,
			name: assistantData.name,
			retries: 0,
			tools: assistantData.tools
		})
	}

	return assistant
}

/**
 * Generates an optimized array of GPT functions based on the commands this Robo has available.
 *
 * @returns An object containing the functions and their handlers.
 */
async function loadFunctions() {
	const functions: ChatFunction[] = []
	const functionHandlers: Record<string, Command> = {}

	// Normalize key to allow formats like "/ai ask", "ai/ask", and "ai ask"
	let whitelistedCommands = Array.isArray(pluginOptions.commands) ? pluginOptions.commands : []
	whitelistedCommands = whitelistedCommands.map((command) => {
		let key = command
		if (key.at(0) === '/') {
			key = key.slice(1)
		}
		key = key.replaceAll('/', ' ')

		return key
	})

	portal.commands
		.filter((command) => {
			// Only allow commands enabled in the plugin options
			if (Array.isArray(pluginOptions.commands)) {
				return whitelistedCommands.includes(command.key.replaceAll('/', ' '))
			} else {
				return !!pluginOptions.commands
			}
		})
		.forEach((command) => {
			const commandParameters: ChatFunctionParameters = {
				type: 'object',
				required: [],
				properties: {}
			}

			// Convert Discord command options to GPT function parameters
			commandParameters.properties =
				command.handler.config?.options?.reduce((properties, option) => {
					properties[option.name] = {
						type: 'string',
						description: option.description ?? ''
					}
					if (option.required) {
						commandParameters.required?.push(option.name)
					}
					return properties
				}, {} as Record<string, ChatFunctionProperty>) ?? {}

			// Add the GPT function to the list
			const functionName = command.key.replaceAll('/', '_')
			functions.push({
				name: functionName,
				description: command.description ?? '',
				parameters: commandParameters
			})
			functionHandlers[functionName] = command.handler
		})
	logger.debug(`Loaded ${functions.length} GPT functions:`, functions)

	return {
		functions,
		functionHandlers
	}
}
