/**
 * Interaction Router
 *
 * Routes Discord interactions to the appropriate handler based on type.
 * Supports slash commands, autocomplete, and context menus.
 */
import { executeCommandHandler } from './handlers/command.js'
import { executeAutocompleteHandler } from './handlers/autocomplete.js'
import { executeContextHandler } from './handlers/context.js'
import type {
	AutocompleteInteraction,
	ChatInputCommandInteraction,
	ContextMenuCommandInteraction,
	Interaction
} from 'discord.js'

/**
 * Interaction types supported by the router
 */
export type InteractionType = 'command' | 'autocomplete' | 'context'

/**
 * Handle an incoming Discord interaction
 *
 * @param interaction - The Discord interaction
 * @param type - The type of interaction
 * @param key - The command/context key
 */
export async function handleInteraction(
	interaction: Interaction,
	type: InteractionType,
	key: string
): Promise<void> {
	switch (type) {
		case 'command':
			await executeCommandHandler(interaction as ChatInputCommandInteraction, key)
			break
		case 'autocomplete':
			await executeAutocompleteHandler(interaction as AutocompleteInteraction, key)
			break
		case 'context':
			await executeContextHandler(interaction as ContextMenuCommandInteraction, key)
			break
	}
}
