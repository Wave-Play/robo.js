/**
 * /mock command - Invoke a slash command interaction.
 *
 * Dispatches a slash command to the bot as if a user
 * had typed it in a Discord channel.
 */
import { getSelectedSessionId, resolveTargetSession } from '../../session-target.js'
import { sessionManager } from '../../../../core/manager.js'
import { createTerminalCommandConfig } from 'robo.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Invoke a slash command',
	positionalArgs: true,
	options: [
		{
			name: '--channel',
			description: 'Channel name or ID',
			type: 'string'
		}
	]
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const session = resolveTargetSession()
	if (!session) {
		ctx.write('No active mock session\n')
		ctx.write('Start with: robo dev --mock\n')
		return
	}

	const commandName = ctx.args[0]
	if (!commandName) {
		ctx.write('Usage: /mock command <name>\n')
		ctx.write('\n')
		ctx.write('Examples:\n')
		ctx.write('  /mock command ping\n')
		ctx.write('  /mock command help\n')
		ctx.write('  /mock command ping --channel general\n')
		return
	}

	// Resolve channel if specified
	let channelId: string | undefined
	const channelArg = ctx.options.channel
	if (channelArg) {
		// Try to find by name or ID
		for (const [id, channel] of session.state.channels) {
			if (id === channelArg || channel.name === channelArg) {
				channelId = id
				break
			}
		}
		if (!channelId) {
			ctx.write(`Channel not found: ${channelArg}\n`)
			return
		}
	}

	try {
		const interaction = await session.dispatchSlashCommand({
			commandName,
			channelId
		})
		ctx.write(`Dispatched /${commandName}\n`)
		ctx.write(`  Interaction ID: ${interaction.id}\n`)

		// Multi-session hint when no explicit selection and multiple sessions exist
		if (sessionManager.size > 1 && !getSelectedSessionId()) {
			ctx.write(`Tip: ${sessionManager.size} sessions active. Use /mock sessions to list.\n`)
		}
	} catch (error) {
		ctx.write(`Failed to dispatch /${commandName}: ${(error as Error).message}\n`)
	}
}
