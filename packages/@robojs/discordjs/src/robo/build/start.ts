/**
 * Build start hook for @robojs/discordjs
 *
 * Runs before directory scanning. Validates environment and prepares build context.
 */
import type { BuildContext } from 'robo.js'
import { Env, registerEnvPattern } from 'robo.js'
import { discordLogger } from '../../core/logger.js'

// Register Discord-specific environment variable patterns
registerEnvPattern('DISCORD_TOKEN', {
	name: 'Discord Bot Token',
	minLength: 70,
	maxLength: 80
})
registerEnvPattern('DISCORD_CLIENT_ID', {
	name: 'Discord Client ID',
	minLength: 17,
	maxLength: 19,
	regex: /^\d+$/
})
registerEnvPattern('DISCORD_CLIENT_SECRET', {
	name: 'Discord Client Secret',
	minLength: 32,
	maxLength: 32
})

export default function (context: BuildContext) {
	const { mode } = context
	const envData = Env.data() ?? {}

	// Validate environment before scanning
	// Fallback to process.env for tools like Doppler that inject directly
	const token = envData.DISCORD_TOKEN ?? process.env.DISCORD_TOKEN
	const clientId = envData.DISCORD_CLIENT_ID ?? process.env.DISCORD_CLIENT_ID

	if (!token) {
		discordLogger.warn('DISCORD_TOKEN is not set. Discord features will not work at runtime.')
	}

	if (!clientId && mode !== 'development') {
		discordLogger.warn('DISCORD_CLIENT_ID is not set. Command registration will fail.')
	}

	// Store validation state for build/complete.ts
	context.store.set('discord:hasToken', !!token)
	context.store.set('discord:hasClientId', !!clientId)

	discordLogger.debug(`Build starting in ${mode} mode`)
}
