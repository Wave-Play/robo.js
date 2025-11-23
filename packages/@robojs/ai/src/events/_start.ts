/**
 * Robo start event handler responsible for initializing the AI plugin, configuring engines, voice
 * features, and token ledger settings.
 */
import { setEngine, setEngineReady } from '@/core/ai.js'
import { logger } from '@/core/logger.js'
import { voiceManager } from '@/core/voice/index.js'
import { tokenLedger, type TokenLimitConfig, type TokenLedgerHooks } from '../core/token-ledger.js'
import { Client } from 'discord.js'
import type { VoiceConfigPatch } from '../core/voice/config.js'
import type { BaseEngine, MCPTool } from '@/engines/base.js'

/** Voice configuration with optional per-guild overrides and instructions. */
interface VoicePluginVoiceOptions extends VoiceConfigPatch {
	perGuild?: Record<string, VoiceConfigPatch>
	instructions?: string
}

/**
 * Plugin configuration structure resolved during initialization.
 */
export interface PluginOptions {
	/** Command allow/deny list configuration. */
	commands?: boolean | string[]
	/** Custom AI engine instance to override defaults. */
	engine?: BaseEngine
	/** Enables vector store insights synchronisation. */
	insight?: boolean
	/** Channel restriction settings limiting where the bot responds. */
	restrict?: {
		channelIds: string[]
	}
	/** System instructions injected into AI prompts. */
	instructions?: string
	/** Whitelist of channels where the bot can respond freely. */
	whitelist?: {
		channelIds: string[]
	}
	/** Voice feature configuration delegated to the voice manager. */
	voice?: VoicePluginVoiceOptions
	/** Token usage tracking configuration. */
	usage?: PluginUsageOptions
	/** MCP (Model Context Protocol) server configurations for tool integration. */
	mcpServers?: MCPTool[]
}

/** Token usage configuration including limit rules and hooks. */
export interface PluginUsageOptions {
	/** Limit rules to enforce via the token ledger. */
	limits?: TokenLimitConfig
	/** Hook fired after usage is recorded. */
	onRecorded?: TokenLedgerHooks['onRecorded']
	/** Hook fired when limit breaches occur. */
	onLimitReached?: TokenLedgerHooks['onLimitReached']
}

/** Resolved plugin options used across the module post-initialization. */
export let options: PluginOptions

/**
 * Initializes the AI plugin during Robo's start lifecycle, configuring token limits, an AI engine,
 * and optional voice features before marking the engine as ready.
 *
 * @param _client Discord client instance (unused but part of the lifecycle signature).
 * @param pluginOptions Configuration resolved from the Robo project.
 */
export default async (_client: Client, pluginOptions: PluginOptions) => {
	options = pluginOptions

	// Check if OpenAI API key is available
	const hasOpenAiKey = typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.trim().length > 0

	// Configure token tracking and limits
	tokenLedger.configure({
		limits: pluginOptions.usage?.limits,
		hooks: {
			onRecorded: pluginOptions.usage?.onRecorded,
			onLimitReached: pluginOptions.usage?.onLimitReached
		}
	})

	// Load default OpenAI engine if no custom engine provided
	if (!options.engine && hasOpenAiKey) {
		try {
			const { OpenAiEngine } = await import('@/engines/openai/engine.js')
			options.engine = new OpenAiEngine()
		} catch (error) {
			logger.error('Failed to load the default OpenAI engine', error)
		}
	}

	// Enable insights by default for vector store sync
	if (options.insight === undefined) {
		options.insight = true
	}

	// Validate engine is configured
	if (!options.engine) {
		logger.warn('No AI engine configured. Provide a custom engine or set OPENAI_API_KEY to enable the OpenAI engine.')

		return
	}

	// Register engine with AI singleton
	setEngine(options.engine)

	const engineFeatures = options.engine.supportedFeatures()
	const engineSupportsVoice = engineFeatures.voice

	// Configure voice features if engine supports them
	if (pluginOptions.voice) {
		if (engineSupportsVoice) {
			await configureVoice(pluginOptions.voice)
		} else {
			await voiceManager.setBaseConfig({ enabled: false })
			logger.warn(
				'Voice configuration supplied but the configured AI engine does not support voice. Voice features are disabled.'
			)
		}
	} else if (!engineSupportsVoice) {
		await voiceManager.setBaseConfig({ enabled: false })
	}

	logger.debug('Initializing AI engine...')
	try {
		// Initialize engine and mark as ready
		await options.engine.init()
		setEngineReady()
		logger.ready('AI is ready!')
	} catch (error) {
		logger.error('Failed to initialize AI engine', error)
	}
}

/**
 * Applies voice configuration via the voice manager, separating shared settings and per-guild
 * overrides while omitting instructions from the base patch.
 */
async function configureVoice(voiceOptions: VoicePluginVoiceOptions) {
	// Separate per-guild config from base config
	const { perGuild, ...rest } = voiceOptions ?? {}
	const basePatch: VoiceConfigPatch = { ...(rest as VoiceConfigPatch) }
	// Remove instructions from base patch (handled separately)
	delete (basePatch as Record<string, unknown>).instructions
	// Apply base voice configuration
	await voiceManager.setBaseConfig(basePatch)

	if (perGuild) {
		// Apply per-guild configuration overrides
		await Promise.all(Object.entries(perGuild).map(([guildId, patch]) => voiceManager.setGuildConfig(guildId, patch)))
	}
}
