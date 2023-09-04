import { Command, portal } from '@roboplay/robo.js'
import { GptFunction, GptFunctionParameters, GptFunctionProperty } from '../core/openai.js'
import { Client } from 'discord.js'

export const gptFunctions: GptFunction[] = []
export const gptFunctionHandlers: Record<string, Command> = {}

export interface PluginOptions {
	openaiKey: string
	systemMessage?: string
}

export let options: PluginOptions

/**
 * Converts all portal commands into GPT functions for later use
 */
export default (_client: Client, pluginOptions: PluginOptions) => {
	options = pluginOptions

	portal.commands.forEach((command) => {
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
}
