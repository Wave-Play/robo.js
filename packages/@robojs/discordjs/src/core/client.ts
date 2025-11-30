/**
 * Discord Client Management
 *
 * Provides the Discord.js client accessor and plugin state management.
 * The client is created and stored during the start hook.
 */
import type { Client } from 'discord.js'
import type { DiscordConfig, PluginState } from '../types/index.js'

/**
 * The Discord client instance.
 * Created during the start hook and destroyed during stop.
 */
let discordClient: Client | null = null

/**
 * Plugin state for internal use.
 */
let pluginState: PluginState | null = null

/**
 * Get the Discord client instance.
 * Returns the client if it has been initialized, otherwise throws.
 *
 * @example
 * ```ts
 * import { getClient } from '@robojs/discordjs'
 *
 * const client = getClient()
 * client.user?.setPresence({ status: 'online' })
 * ```
 */
export function getClient(): Client {
	if (!discordClient) {
		throw new Error(
			'Discord client is not initialized. Make sure the @robojs/discordjs plugin is installed and the bot has started.'
		)
	}
	return discordClient
}

/**
 * Check if the Discord client is initialized.
 */
export function hasClient(): boolean {
	return discordClient !== null
}

/**
 * Set the Discord client instance.
 * Called internally by the start hook.
 *
 * @internal
 */
export function setClient(client: Client): void {
	discordClient = client
}

/**
 * Clear the Discord client instance.
 * Called internally by the stop hook.
 *
 * @internal
 */
export function clearClient(): void {
	discordClient = null
}

/**
 * Get the plugin state.
 *
 * @internal
 */
export function getPluginState(): PluginState | null {
	return pluginState
}

/**
 * Set the plugin state.
 * Called during plugin initialization.
 *
 * @internal
 */
export function setPluginState(state: PluginState): void {
	pluginState = state
}

/**
 * Get the plugin configuration.
 * Returns the config from plugin state, or an empty object if not set.
 */
export function getPluginConfig(): DiscordConfig {
	return pluginState?.config ?? {}
}
