import { handlers } from '@dressed/react/callbacks'
import { Interaction, InteractionType } from 'discord.js'

export default async (interaction: Interaction) => {
	if (interaction.type === InteractionType.MessageComponent && interaction.customId.startsWith('@dressed/react')) {
		const [handlerId, fallback] = interaction.customId.split('-').slice(2)
		const handler = handlers.get(handlerId) ?? handlers.get(fallback ?? 'default')
		await handler?.(interaction as never)
		if (!interaction.replied && !interaction.deferred) interaction.deferUpdate()
	}
}
