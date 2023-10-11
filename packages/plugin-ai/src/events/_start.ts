import { Command, portal } from '@roboplay/robo.js'
import { GptFunction, GptFunctionParameters, GptFunctionProperty } from '../core/openai.js'
import { Client } from 'discord.js'
import { logger } from '../core/logger.js'

export const gptFunctions: GptFunction[] = []
export const gptFunctionHandlers: Record<string, Command> = {}

export interface PluginOptions {
	commands?: boolean | string[]
	model?: string
	openaiKey: string
	systemMessage?: string
	whitelist?: {
		channelIds: string[]
	}
}

export let options: PluginOptions

/**
 * Converts all portal commands into GPT functions for later use
 */
export default (_client: Client, pluginOptions: PluginOptions) => {
	options = pluginOptions

	portal.commands
		.filter((command) => {
			// Only allow commands enabled in the plugin options
			if (Array.isArray(options.commands)) {
				return options.commands.includes(command.key.replaceAll('/', ' '))
			} else {
				return options.commands
			}
		})
		.forEach((command) => {
			const commandParameters: GptFunctionParameters = {
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
				}, {} as Record<string, GptFunctionProperty>) ?? {}

			// Add the GPT function to the list
			const functionName = command.key.replaceAll('/', '_')
			gptFunctions.push({
				name: functionName,
				description: command.description ?? '',
				parameters: commandParameters
			})
			gptFunctionHandlers[functionName] = command.handler
		})
	logger.debug(`Loaded ${gptFunctions.length} GPT functions:`, gptFunctions)
}
