import { getState, logger, setState } from 'robo.js'
import { ID_NAMESPACE } from './constants.js'

export interface GuildSettings {
	auditLogsChannelId?: string
	logsChannelId?: string
	mailChannelId?: string
	lockdownMode?: boolean
	requireConfirmation?: boolean
	testMode?: boolean
}

export function getSettings(guildId: string | null): GuildSettings {
	if (!guildId) {
		throw new Error(`Guild ID is required to get moderation settings`)
	}

	const guildSettings = getState<GuildSettings>(`settings`, {
		namespace: ID_NAMESPACE + guildId
	})

	logger.debug(`Loaded settings for guild ${guildId}:`, guildSettings ?? {})
	return guildSettings ?? {}
}

export function updateSettings(guildId: string | null, settings: GuildSettings): GuildSettings {
	if (!guildId) {
		throw new Error(`Guild ID is required to update moderation settings`)
	}

	const currentSettings = getSettings(guildId)
	const newSettings = {
		...currentSettings,
		...settings
	}

	setState<GuildSettings>(`settings`, newSettings, {
		namespace: ID_NAMESPACE + guildId,
		persist: true
	})
	logger.debug(`Updated settings for guild ${guildId}:`, newSettings)

	return newSettings
}
