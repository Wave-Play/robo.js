import { setEngine } from '@/core/ai.js'
import { logger } from '@/core/logger.js'
import { OpenAiEngine } from '@/engines/openai/engine.js'
import { Client } from 'discord.js'
import type { BaseEngine } from '@/engines/base.js'

export interface PluginOptions {
	commands?: boolean | string[]
	engine?: BaseEngine
	insight?: boolean
	maxTokens?: number
	model?: string
	pollDelay?: number
	restrict?: {
		channelIds: string[]
	}
	systemMessage?: string
	temperature?: number
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

	// OpenAI is the default engine for now
	if (!options.engine) {
		options.engine = new OpenAiEngine()
	}
	setEngine(options.engine)

	// Insights are enabled by default
	if (options.insight === undefined) {
		options.insight = true
	}

	// Prepare the AI engine in the background
	logger.debug('Initializing AI engine...')
	options.engine.init().then(() => {
		logger.ready('AI is ready!')
	})
}
