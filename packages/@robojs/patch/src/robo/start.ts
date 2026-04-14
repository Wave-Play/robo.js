import { patchLogger } from '../core/loggers.js'
import { DiscordEntryPointCommand } from '../discord-entry-point-command/patch.js'

// Patch entry point automatically called when the app starts
export default () => {
	if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_TOKEN) {
		DiscordEntryPointCommand.patch().catch(patchLogger.warn)
	}
}
