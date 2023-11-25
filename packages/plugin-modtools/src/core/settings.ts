import { Flashcore, logger } from '@roboplay/robo.js'
import { ID_NAMESPACE } from './constants.js'

export interface GuildSettings {
	auditLogsChannelId?: string
	logsChannelId?: string
	mailChannelId?: string
	requireConfirmation?: boolean
	testMode?: boolean
}

export async function getSettings(guildId: string | null): Promise<GuildSettings> {
	if (!guildId) {
		throw new Error(`Guild ID is required to get moderation settings`)
	}

	const guildSettings = await Flashcore.get<GuildSettings>(`settings`, {
		namespace: ID_NAMESPACE + guildId
	})

	logger.debug(`Loaded settings for guild ${guildId}:`, guildSettings ?? {})
	return guildSettings ?? {}
}

export async function updateSettings(guildId: string | null, settings: GuildSettings): Promise<GuildSettings> {
	if (!guildId) {
		throw new Error(`Guild ID is required to update moderation settings`)
	}

	const currentSettings = await getSettings(guildId)
	const newSettings = {
		...currentSettings,
		...settings
	}

	await Flashcore.set<GuildSettings>(`settings`, newSettings, {
		namespace: ID_NAMESPACE + guildId
	})
	logger.debug(`Updated settings for guild ${guildId}:`, newSettings)

	return newSettings
}
