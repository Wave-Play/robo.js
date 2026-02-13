import type { SessionConfig } from './index.js'

/**
 * Configuration options for the @robojs/mock plugin.
 *
 * These options can be set in your project's plugin configuration:
 * ```typescript
 * // config/plugins/robojs/mock.ts
 * export default {
 *   autoOpenStage: true,
 *   defaultSessionConfig: {
 *     guilds: [{ name: 'Test Server' }]
 *   }
 * }
 * ```
 */
export interface MockPluginConfig {
	/**
	 * Automatically open the Stage UI in the browser when running `robo mock start`.
	 * Can be overridden with the `--no-browser` CLI flag.
	 * @default true
	 */
	autoOpenStage?: boolean

	/**
	 * Default session configuration used when running `robo mock start`.
	 * Provides initial state for guilds, users, channels, etc.
	 */
	defaultSessionConfig?: SessionConfig

	/**
	 * Directory path for storing mock session data.
	 * Relative to the .robo directory.
	 * @default 'mock'
	 */
	dataDirectory?: string

	/**
	 * Port for standalone mock server mode (`robo mock start` command).
	 * Uses a unique default to avoid clashing with user's server.
	 * @default 6625
	 */
	standalonePort?: number
}

/**
 * Default plugin configuration values.
 */
export const DEFAULT_MOCK_PLUGIN_CONFIG: Required<MockPluginConfig> = {
	autoOpenStage: true,
	defaultSessionConfig: {
		guilds: [
			{
				name: 'Test Server',
				channels: [
					{ name: 'Text Channels', type: 4, position: 0 },
					{ name: 'general', type: 0, parentCategory: 'Text Channels', position: 0 },
					{ name: 'Voice Channels', type: 4, position: 1 },
					{ name: 'General', type: 2, parentCategory: 'Voice Channels', position: 0 }
				]
			}
		],
		users: [
			{
				username: 'TestUser',
				bot: false
			}
		]
	},
	dataDirectory: 'mock',
	standalonePort: 6625
}
