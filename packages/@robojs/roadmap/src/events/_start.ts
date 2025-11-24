/**
 * Plugin initialization event handler
 *
 * This module handles the plugin lifecycle by:
 * - Loading plugin options from config files or defaults
 * - Resolving provider configuration from multiple sources (plugin options, environment variables)
 * - Instantiating and initializing the roadmap provider
 * - Exposing provider accessor functions for commands
 *
 * The initialization follows a graceful degradation pattern - if configuration is missing
 * or invalid, the plugin loads but remains inactive until properly configured.
 *
 * @module
 */

import type { Client } from 'discord.js'
import { getPluginOptions, logger } from 'robo.js'
import { JiraProvider } from '../providers/jira.js'
import type { JiraProviderConfig } from '../providers/jira.js'
import type { RoadmapProvider } from '../providers/base.js'
import type { ProviderConfig } from '../types.js'

/**
 * Plugin options interface
 *
 * These options can be configured in config/plugins/robojs/roadmap.* files
 * to customize the roadmap plugin behavior.
 *
 * @example
 * Basic configuration with Jira provider:
 * ```ts
 * // config/plugins/robojs/roadmap.ts
 * export default {
 *   provider: {
 *     type: 'jira',
 *     options: {
 *       url: process.env.JIRA_URL,
 *       email: process.env.JIRA_EMAIL,
 *       apiToken: process.env.JIRA_API_TOKEN,
 *       jql: '(issuetype = Epic AND (labels NOT IN ("Private") OR labels IS EMPTY)) OR labels IN ("Public")'
 *     }
 *   }
 * }
 * ```
 *
 * @example
 * Advanced configuration with pre-instantiated provider:
 * ```ts
 * import { JiraProvider } from '@robojs/roadmap'
 *
 * const customProvider = new JiraProvider({
 *   type: 'jira',
 *   options: {
 *     url: 'https://company.atlassian.net',
 *     email: 'bot@company.com',
 *     apiToken: 'secret-token',
 *     jql: 'project = MYPROJECT'
 *   }
 * })
 *
 * export default {
 *   provider: customProvider,
 *   autoSync: true,
 *   autocompleteCacheTtl: 600000 // 10 minutes
 * }
 * ```
 */
export interface RoadmapPluginOptions {
	/**
	 * Provider configuration or pre-instantiated provider instance.
	 *
	 * Can be either:
	 * - A ProviderConfig object with type and options
	 * - A pre-instantiated RoadmapProvider instance (for advanced customization)
	 *
	 * If not provided, falls back to environment variables (JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN).
	 */
	provider?: ProviderConfig | RoadmapProvider

	/**
	 * Whether to automatically sync on startup.
	 *
	 * @defaultValue false
	 * @remarks Currently not implemented - reserved for future enhancement
	 */
	autoSync?: boolean

	/**
	 * Interval in milliseconds for automatic syncing.
	 *
	 * @remarks Reserved for future implementation
	 */
	syncInterval?: number

	/**
	 * Time-to-live in milliseconds for autocomplete cache entries (issue types, columns, labels).
	 *
	 * Controls how long autocomplete suggestions are cached before being refreshed from the provider.
	 * Lower values provide fresher data but increase API calls; higher values reduce API load but may show stale data.
	 *
	 * @defaultValue 300000 (5 minutes)
	 * @remarks This setting affects all autocomplete handlers in roadmap commands. The cache is per-guild and shared across all autocomplete options.
	 *
	 * @example
	 * ```ts
	 * export default {
	 *   autocompleteCacheTtl: 600000 // 10 minutes
	 * }
	 * ```
	 */
	autocompleteCacheTtl?: number

	/**
	 * Whether roadmap command responses (e.g., /roadmap add, /roadmap edit) should be ephemeral.
	 *
	 * When true, command replies are only visible to the invoking user. When false, results are
	 * posted visibly in the channel so project teams can see card creation and edit activity.
	 *
	 * @defaultValue true
	 *
	 * @example
	 * ```ts
	 * export default {
	 *   ephemeralCommands: false // share add/edit results with the whole channel
	 * }
	 * ```
	 */
	ephemeralCommands?: boolean
}

// Create namespaced logger for initialization
const initLogger = logger.fork('roadmap')

// Global provider state
let _provider: RoadmapProvider | null = null
let _initialized = false

/**
 * Resolved plugin options from config or defaults
 *
 * @remarks
 * This is populated during initialization and can be accessed by other modules
 * to inspect the resolved configuration.
 */
export let options: RoadmapPluginOptions = {}

/**
 * Get the initialized provider instance
 *
 * @returns The initialized provider, or null if not initialized
 *
 * @example
 * ```ts
 * import { getProvider, isProviderReady } from '@robojs/roadmap'
 *
 * if (isProviderReady()) {
 *   const provider = getProvider()
 *   const cards = await provider.fetchCards()
 * }
 * ```
 */
export function getProvider(): RoadmapProvider | null {
	return _provider
}

/**
 * Check if the provider is initialized and ready to use
 *
 * @returns true if provider is initialized, false otherwise
 *
 * @example
 * ```ts
 * import { isProviderReady } from '@robojs/roadmap'
 *
 * if (!isProviderReady()) {
 *   console.error('Provider not configured')
 *   return
 * }
 * ```
 */
export function isProviderReady(): boolean {
	return _initialized
}

/**
 * Resolve provider configuration from plugin options
 *
 * This function implements the configuration precedence:
 * 1. Pre-instantiated provider instance in plugin options
 * 2. Provider config object in plugin options
 * 3. Environment variables (JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN)
 * 4. null (no configuration found)
 *
 * @param pluginOptions - Plugin options from config or defaults
 * @returns Resolved provider config or instance, or null if not found
 */
function resolveProviderConfig(pluginOptions: RoadmapPluginOptions): ProviderConfig | RoadmapProvider | null {
	// Check for pre-instantiated provider instance
	if (pluginOptions.provider && typeof pluginOptions.provider === 'object' && 'init' in pluginOptions.provider) {
		initLogger.debug('Using pre-instantiated provider from plugin options')
		return pluginOptions.provider as RoadmapProvider
	}

	// Check for provider config object in options
	if (pluginOptions.provider && typeof pluginOptions.provider === 'object' && 'type' in pluginOptions.provider) {
		initLogger.debug('Using provider config from plugin options')
		return pluginOptions.provider as ProviderConfig
	}

	// Fallback to environment variables for Jira
	const jiraUrl = process.env.JIRA_URL
	const jiraEmail = process.env.JIRA_EMAIL
	const jiraApiToken = process.env.JIRA_API_TOKEN

	// Build default Jira config from environment
	if (jiraUrl && jiraEmail && jiraApiToken) {
		initLogger.debug('Building default provider config from environment variables')
		return {
			type: 'jira',
			options: {
				url: jiraUrl,
				email: jiraEmail,
				apiToken: jiraApiToken,
				jql: process.env.JIRA_JQL
			}
		}
	}

	// No configuration found in any source
	initLogger.debug('No provider configuration found')

	return null
}

/**
 * Instantiate a provider from configuration
 *
 * This function creates a provider instance from a ProviderConfig object,
 * validates the configuration, and initializes the provider.
 *
 * @param config - Provider configuration object
 * @returns Initialized provider instance
 * @throws Error if provider type is unsupported or initialization fails
 */
async function instantiateProvider(config: ProviderConfig): Promise<RoadmapProvider> {
	// Only Jira provider is currently supported
	if (config.type !== 'jira') {
		throw new Error(`Unsupported provider type: ${config.type}. Currently only 'jira' is supported.`)
	}

	// Create Jira provider instance
	const jiraConfig: JiraProviderConfig = {
		type: 'jira',
		options: config.options
	}
	const provider = new JiraProvider(jiraConfig)

	// Validate provider configuration
	if (!provider.validateConfig()) {
		throw new Error(`Provider configuration validation failed. Check your ${config.type} credentials and settings.`)
	}

	// Initialize provider (authenticate and verify connectivity)
	try {
		await provider.init()
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		throw new Error(`Failed to initialize ${config.type} provider: ${message}`)
	}

	return provider
}

/**
 * Plugin initialization event handler
 *
 * This is the main entry point for plugin initialization. It loads plugin options,
 * resolves provider configuration, instantiates and initializes the provider,
 * and stores it in global state for access by commands.
 *
 * The initialization is graceful - if configuration is missing or invalid, the plugin
 * loads but remains inactive, with informative logging to guide users.
 *
 * @param _client - Discord.js client instance (unused)
 * @param pluginOptions - Plugin options from config or defaults
 *
 * @example
 * Typical plugin configuration:
 * ```ts
 * // config/plugins/robojs/roadmap.ts
 * export default {
 *   provider: {
 *     type: 'jira',
 *     options: {
 *       url: process.env.JIRA_URL,
 *       email: process.env.JIRA_EMAIL,
 *       apiToken: process.env.JIRA_API_TOKEN,
 *       jql: '(issuetype = Epic AND (labels NOT IN ("Private") OR labels IS EMPTY)) OR labels IN ("Public")'
 *     }
 *   }
 * }
 * ```
 *
 * @remarks
 * Configuration precedence:
 * 1. Pre-instantiated provider in pluginOptions.provider
 * 2. Provider config object in pluginOptions.provider
 * 3. Environment variables (JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN)
 *
 * Graceful degradation:
 * - If no configuration is found, plugin loads but remains inactive
 * - If configuration is invalid, plugin loads but logs actionable error guidance
 * - Commands check isProviderReady() before attempting to use the provider
 */
export default async function (_client: Client, pluginOptions?: RoadmapPluginOptions) {
	// Load plugin options from config or defaults
	const rawOptions = pluginOptions ?? getPluginOptions('@robojs/roadmap') ?? {}
	options = rawOptions as RoadmapPluginOptions
	initLogger.debug('Loading roadmap plugin options')

	// Resolve provider configuration from multiple sources
	const providerConfig = resolveProviderConfig(options)

	// Handle missing configuration gracefully
	if (!providerConfig) {
		initLogger.info(
			'No roadmap provider configured. Set JIRA_URL, JIRA_EMAIL, and JIRA_API_TOKEN environment variables, ' +
				'or configure a provider in your plugin options. The plugin will remain inactive until configured.'
		)

		return
	}

	// Handle pre-instantiated provider
	if ('init' in providerConfig) {
		initLogger.debug('Using pre-instantiated provider')
		_provider = providerConfig as RoadmapProvider

		// Initialize provider (may already be initialized)
		try {
			await _provider.init()
			_initialized = true
			initLogger.ready('Roadmap provider is ready')

			return
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			const messageLower = message.toLowerCase()

			// Check if error indicates provider is already initialized
			if (messageLower.includes('already initialized') || messageLower.includes('already ready')) {
				_initialized = true
				initLogger.ready('Roadmap provider is ready (was already initialized)')

				return
			}

			initLogger.error(`Failed to initialize pre-instantiated provider: ${message}`)
			initLogger.error(
				'Check the provider configuration and credentials. The roadmap plugin will remain inactive until the provider is properly configured.'
			)

			return
		}
	}

	// Instantiate provider from config object
	try {
		_provider = await instantiateProvider(providerConfig as ProviderConfig)
		_initialized = true

		// Get provider info for logging
		const info = await _provider.getProviderInfo()
		initLogger.ready(`Roadmap provider initialized: ${info.name} v${info.version}`)

		// Check auto-sync option (not yet implemented)
		if (options.autoSync === true) {
			initLogger.info('Auto-sync is enabled but not yet implemented. Use /roadmap sync to manually sync.')
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		initLogger.error(`Failed to initialize roadmap provider: ${message}`)
		initLogger.error(
			'Ensure your provider credentials are correct. For Jira, verify JIRA_URL, JIRA_EMAIL, and JIRA_API_TOKEN. ' +
				'The roadmap plugin will remain inactive until the provider is properly configured.'
		)
		// Do not throw - allow plugin to load but remain inactive
	}
}
