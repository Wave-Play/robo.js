import { Flashcore, logger } from 'robo.js'

/*
 * Customize your subcommand details and options here.
 *
 * For more information, see the documentation:
 * https://robojs.dev/discord-bots/commands#command-options
 */
export const config = {
	description: 'Unlock the hidden prowess of someone'
} as const

/**
 * This handler will be called when the subcommand is used. You can go a folder deeper to create subcommand groups.
 *
 * For more information, see the documentation:
 * https://robojs.dev/discord-bots/commands#subcommands-and-subcommand-groups
 */
export default async () => {
	logger.info('Boosting developer')
	await sleep(1_000)

	// Flashcore is an optional KV database built into Robo.js
	// Data is stored on your local machine but it can be ported to a cloud provider using adapters
	// https://robojs.dev/robojs/flashcore
	const previousBoost = (await Flashcore.get<number>('boosts:dev')) ?? 0
	const newBoost = (previousBoost + 1) % 5
	await Flashcore.set('boosts:dev', newBoost)

	return `Boosts ${previousBoost} → ${newBoost}. Keep it up!`
}

// Wait for a specified amount of time
async function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
