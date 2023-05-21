import { Configuration, OpenAIApi } from 'openai'

export let openai: OpenAIApi

export let pluginOptions: PluginOptions

export function init(options: PluginOptions) {
	const { openaiKey, ...rest } = options
	pluginOptions = {
		...rest,
		openaiKey: '[REDACTED]'
	}

	openai = new OpenAIApi(
		new Configuration({
			apiKey: openaiKey
		})
	)
}

export interface PluginOptions {
	openaiKey: string
	quoteMessage?: string
	systemMessage?: string
	temperature?: number
}
