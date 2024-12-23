import { Colors } from 'discord.js'
import { createCommandConfig, Flashcore, logger } from 'robo.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { CommandOptions, CommandResult } from 'robo.js'

/*
 * Customize your subcommand details and options here.
 *
 * `contexts` can be used to limit where the command can be used.
 * `integrationTypes` can be used to limit where the command can be installed.
 * `options` can be used to get user input.
 * `sage` can be used to customize the command's behavior, such as making replies ephemeral.
 * 
 * For more information, see the documentation:
 * https://robojs.dev/discord-bots/commands#command-options
 */
export const config = createCommandConfig({
	description: 'Unlock the hidden prowess of someone',
	contexts: ['Guild'],
	integrationTypes: ['GuildInstall', 'UserInstall'],
	options: [
		{
			name: 'developer',
			description: 'The developer to boost',
			required: true,
			type: 'user'
		}
	],
	sage: {
		ephemeral: true
	}
} as const)

/**
 * This handler will be called when the subcommand is used. You can go a folder deeper to create subcommand groups.
 * Sage Mode kicks in and auto defers when the command takes longer than 250ms by default.
 *
 * For more information, see the documentation:
 * https://robojs.dev/discord-bots/commands#subcommands-and-subcommand-groups
 */
export default async (
	interaction: ChatInputCommandInteraction,
	options: CommandOptions<typeof config>
): Promise<CommandResult> => {
	logger.info(`${interaction.user} is boosting ${options.developer}`)
	await sleep(1_000)

	// Flashcore is an optional KV database built into Robo.js
	// Data is stored on your local machine but it can be pointed to other databases using adapters
	// https://robojs.dev/robojs/flashcore
	const previousBoost = (await Flashcore.get<number>(`boosts:${options.developer.id}`)) ?? 0
	const newBoost = (previousBoost + 1) % 5
	await Flashcore.set(`boosts:${options.developer.id}`, newBoost)

	// You can return the same thing you would pass to `interaction.reply`, such as embeds or strings
	return {
		embeds: [
			{
				color: Colors.Blurple,
				description: `Boosts **${previousBoost} → ${newBoost}**. Keep it up!`,
				footer: {
					icon_url: interaction.user.displayAvatarURL(),
					text: `Boosted by @${interaction.user.tag}`
				},
				thumbnail: {
					url: options.developer.displayAvatarURL()
				},
				title: `@${options.developer.tag} has been boosted!`
			}
		]
	}
}

// Wait for a specified amount of time
async function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
