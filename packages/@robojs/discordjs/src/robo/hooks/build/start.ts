/**
 * Build start hook for @robojs/discordjs
 *
 * Runs before directory scanning. Validates environment and prepares build context.
 */
import type { BuildContext } from 'robo.js'
import { Env } from 'robo.js'
import { discordLogger } from '../../../core/logger.js'

export default function (context: BuildContext) {
	const { mode } = context
	const envData = Env.data()

	// Validate environment before scanning
	const token = envData.DISCORD_TOKEN
	const clientId = envData.DISCORD_CLIENT_ID

	if (!token) {
		discordLogger.warn('DISCORD_TOKEN is not set. Discord features will not work at runtime.')
	}

	if (!clientId && mode === 'production') {
		discordLogger.warn('DISCORD_CLIENT_ID is not set. Command registration will fail.')
	}

	// Store validation state for build/complete.ts
	context.store.set('discord:hasToken', !!token)
	context.store.set('discord:hasClientId', !!clientId)

	discordLogger.debug(`Build starting in ${mode} mode`)
}
