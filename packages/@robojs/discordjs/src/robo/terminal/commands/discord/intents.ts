/**
 * /discord intents - Analyze intent configuration.
 *
 * Shows which gateway intents are enabled, maps events to their
 * required intents, and warns about any missing intents.
 */
import { getClient, hasClient } from '../../../../core/client.js'
import { REQUIRED_INTENTS, getIntentNames } from '../../../../core/intents.js'
import { createTerminalCommandConfig, Manifest } from 'robo.js'
import { GatewayIntentBits } from 'discord.js'
import type { TerminalContext } from 'robo.js'

export const config = createTerminalCommandConfig({
	description: 'Analyze intent configuration'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	if (!hasClient()) {
		ctx.write('Bot not connected\n')
		ctx.write('Make sure @robojs/discordjs is installed and the bot has started.\n')
		return
	}

	const client = getClient()
	const intents = Number(client.options.intents.bitfield)

	// Build reverse mapping: intent bit -> name
	const intentBitToName = Object.fromEntries(
		Object.entries(GatewayIntentBits)
			.filter(([key]) => isNaN(Number(key)))
			.map(([key, value]) => [value, key])
	)

	// Find enabled intents
	const enabledIntents: string[] = []
	for (const [bit, name] of Object.entries(intentBitToName)) {
		if ((intents & Number(bit)) > 0) {
			enabledIntents.push(name as string)
		}
	}

	ctx.write('Intent Analysis\n\n')
	ctx.write(`Enabled Intents (${enabledIntents.length}):\n`)
	for (const name of enabledIntents) {
		ctx.write(`  + ${name}\n`)
	}
	ctx.write('\n')

	// Check registered events against intents
	const summaries = await Manifest.routeSummaries('discordjs', 'events')
	const eventNames = [...new Set(summaries.map((s) => s.key))]

	// Map intents to events that need them
	const intentToEvents = new Map<string, string[]>()
	const missingIntents = new Map<string, string[]>()

	for (const event of eventNames) {
		const requiredBit = REQUIRED_INTENTS[event]
		if (!requiredBit) {
			continue
		}

		const bits = Array.isArray(requiredBit) ? requiredBit : [requiredBit]
		const names = getIntentNames(new Set<GatewayIntentBits>(bits))

		for (let i = 0; i < bits.length; i++) {
			const bit = bits[i]
			const name = names[i]

			// Track which events need this intent
			if (!intentToEvents.has(name)) {
				intentToEvents.set(name, [])
			}
			intentToEvents.get(name)!.push(event)

			// Check if intent is missing
			if (Array.isArray(requiredBit)) {
				const hasAny = requiredBit.some((b) => (intents & b) > 0)
				if (!hasAny) {
					if (!missingIntents.has(name)) {
						missingIntents.set(name, [])
					}
					if (!missingIntents.get(name)!.includes(event)) {
						missingIntents.get(name)!.push(event)
					}
				}
			} else if ((intents & bit) === 0) {
				if (!missingIntents.has(name)) {
					missingIntents.set(name, [])
				}
				missingIntents.get(name)!.push(event)
			}
		}
	}

	// Show intent-to-event mapping
	if (intentToEvents.size > 0) {
		ctx.write('Events by Intent:\n')
		for (const [intent, events] of intentToEvents) {
			ctx.write(`  ${intent}:\n`)
			for (const event of events) {
				ctx.write(`    - ${event}\n`)
			}
		}
		ctx.write('\n')
	}

	// Show warnings for missing intents
	if (missingIntents.size > 0) {
		ctx.write('Warnings:\n')
		for (const [intent, events] of missingIntents) {
			ctx.write(`  Missing ${intent}:\n`)
			for (const event of events) {
				ctx.write(`    - ${event} will not fire\n`)
			}
		}
		ctx.write('\n')
	} else {
		ctx.write('All registered events have the required intents enabled.\n')
	}
}
