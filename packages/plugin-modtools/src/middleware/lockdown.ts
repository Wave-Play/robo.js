import { hasPermission } from '../core/utils.js'
import { getSettings } from '../core/settings.js'
import { logger } from 'robo.js'
import type { MiddlewareData, MiddlewareResult } from 'robo.js'
import type { ChatInputCommandInteraction } from 'discord.js'

interface LockdownData {
	enabled: boolean
}

export default async (data: MiddlewareData): Promise<MiddlewareResult | void> => {
	const { key, plugin, type } = data.record
	const isSelfPlugin = plugin?.name === '@robojs/moderation'

	// Only lock down commands
	if (type !== 'command') {
		return
	}

	// Only lock down when lockdown mode is enabled
	const interaction = data.payload[0] as ChatInputCommandInteraction
	const settings = getSettings(interaction.guildId)
	if (!settings.lockdownMode) {
		return
	}

	// Don't lock down "/mod setup" command (so that we can enable/disable lockdown mode)
	if (isSelfPlugin && key === 'mod/setup') {
		return
	}

	// Alright, lockdown time
	if (!hasPermission(interaction, 'ModerateMembers')) {
		logger.debug(`Locking down command ${key} for guild ${interaction.guildId}`)
		await interaction.reply({
			content: `Sorry, this command is currently disabled.`,
			ephemeral: true
		})

		return { abort: true }
	}
}

export function getLockdown(guildId: string): LockdownData {
	const settings = getSettings(guildId)

	return {
		enabled: !!settings.lockdownMode
	}
}
