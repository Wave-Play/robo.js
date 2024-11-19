import { Treat, Treats } from '../core/treats.js'
import { ChatInputCommandInteraction } from 'discord.js'
import { createCommandConfig, Flashcore } from 'robo.js'
import type { CommandOptions } from 'robo.js'

export const config = createCommandConfig({
	description: 'Bake something delicious',
	options: [
		{
			name: 'treat',
			description: 'The treat to bake',
			required: true,
			choices: Treats.map((treat) => ({
				name: treat.name,
				value: treat.name.toLowerCase()
			}))
		}
	]
} as const)

export default async (interaction: ChatInputCommandInteraction, options: CommandOptions<typeof config>) => {
	const { treat } = options

	// Save the treat to the user's inventory
	const selected = Treats.find((t) => t.name.toLowerCase() === treat)!
	const inventory = (await Flashcore.get<Treat[]>('inventory', { namespace: interaction.user.id })) ?? []
	inventory.push(selected)
	await Flashcore.set('inventory', inventory, { namespace: interaction.user.id })

	return `${interaction.member} baked a ${treat}! 🍪`
}
