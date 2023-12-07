import { packageJson } from '@/core/constants.js'
import { BaseEngine } from '@/engines/base.js'
import { openai } from '@/engines/openai/api.js'
import { options as pluginOptions } from '@/events/_start.js'
import { logger, portal } from '@roboplay/robo.js'
import type { ChatFunction, ChatFunctionParameters, ChatFunctionProperty, ChatMessage, ChatOptions, ChatResult, GenerateImageOptions, GenerateImageResult } from '@/engines/base.js'
import type { Command } from '@roboplay/robo.js'

export class OpenAiEngine extends BaseEngine {
	protected gptFunctions: ChatFunction[] = []
	protected gptFunctionHandlers: Record<string, Command> = {}

	public async chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResult> {
		const { functions = this.gptFunctions, model = pluginOptions?.model ?? 'gpt-3.5-turbo' } = options ?? {}

		const response = await openai.chat({
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
		return this.gptFunctionHandlers
	}

	public getInfo() {
		return {
			name: 'OpenAI',
			version: packageJson.version
		}
	}

	public async init() {
		portal.commands
			.filter((command) => {
				// Only allow commands enabled in the plugin options
				if (Array.isArray(pluginOptions.commands)) {
					return pluginOptions.commands.includes(command.key.replaceAll('/', ' '))
				} else {
					return pluginOptions.commands
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
				this.gptFunctions.push({
					name: functionName,
					description: command.description ?? '',
					parameters: commandParameters
				})
				this.gptFunctionHandlers[functionName] = command.handler
			})
		logger.debug(`Loaded ${this.gptFunctions.length} GPT functions:`, this.gptFunctions)
	}
}
