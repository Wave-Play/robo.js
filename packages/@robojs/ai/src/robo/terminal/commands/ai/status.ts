/**
 * /ai status - Show AI engine status.
 *
 * Displays engine info, supported features, MCP servers, voice sessions,
 * and channel configuration.
 */
import { createTerminalCommandConfig } from 'robo.js'
import { AI, getEngine } from '../../../../core/ai.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Show AI engine status'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const engine = getEngine()

	if (!engine) {
		ctx.write('AI engine not initialized\n')
		return
	}

	const info = engine.getInfo()
	const features = engine.supportedFeatures()
	const mcpServers = AI.getMCPServers()
	const whitelistChannels = AI.getWhitelistChannels()
	const restrictChannels = AI.getRestrictChannels()

	// Engine info
	ctx.write('Engine\n')
	ctx.write('\u2500'.repeat(40) + '\n')
	ctx.write(`  Name:      ${info.name ?? 'Unknown'}\n`)
	ctx.write(`  Version:   ${info.version ?? 'Unknown'}\n`)
	if (info.model) {
		ctx.write(`  Model:     ${info.model}\n`)
	}
	ctx.write(`  Ready:     ${AI.isReady() ? 'Yes' : 'No'}\n`)
	ctx.write('\n')

	// Supported features
	ctx.write('Features\n')
	ctx.write('\u2500'.repeat(40) + '\n')
	ctx.write(`  Voice:              ${features.voice ? 'Yes' : 'No'}\n`)
	ctx.write(`  Vision:             ${features.vision ? 'Yes' : 'No'}\n`)
	ctx.write(`  Transcription:      ${features.voiceTranscription ? 'Yes' : 'No'}\n`)
	ctx.write('\n')

	// MCP servers
	ctx.write('MCP Servers\n')
	ctx.write('\u2500'.repeat(40) + '\n')
	if (mcpServers.length === 0) {
		ctx.write('  None configured\n')
	} else {
		ctx.write(`  Count: ${mcpServers.length}\n`)
		for (const server of mcpServers) {
			ctx.write(`  - ${server.server_label}\n`)
		}
	}
	ctx.write('\n')

	// Voice sessions
	try {
		const voiceStatus = await AI.getVoiceStatus()
		ctx.write('Voice Sessions\n')
		ctx.write('\u2500'.repeat(40) + '\n')
		if (voiceStatus && typeof voiceStatus === 'object') {
			const sessions = (voiceStatus as Record<string, unknown>).activeSessions
			if (typeof sessions === 'number') {
				ctx.write(`  Active: ${sessions}\n`)
			} else {
				ctx.write(`  Status: Connected\n`)
			}
		} else {
			ctx.write('  No active sessions\n')
		}
		ctx.write('\n')
	} catch {
		ctx.write('Voice Sessions\n')
		ctx.write('\u2500'.repeat(40) + '\n')
		ctx.write('  Unavailable\n')
		ctx.write('\n')
	}

	// Channel configuration
	ctx.write('Channels\n')
	ctx.write('\u2500'.repeat(40) + '\n')
	ctx.write(`  Whitelisted: ${whitelistChannels.length > 0 ? whitelistChannels.length : 'None'}\n`)
	ctx.write(`  Restricted:  ${restrictChannels.length > 0 ? restrictChannels.length : 'None'}\n`)
	if (whitelistChannels.length > 0) {
		ctx.write('  Whitelist IDs:\n')
		for (const id of whitelistChannels) {
			ctx.write(`    - ${id}\n`)
		}
	}
	if (restrictChannels.length > 0) {
		ctx.write('  Restrict IDs:\n')
		for (const id of restrictChannels) {
			ctx.write(`    - ${id}\n`)
		}
	}
	ctx.write('\n')
}
