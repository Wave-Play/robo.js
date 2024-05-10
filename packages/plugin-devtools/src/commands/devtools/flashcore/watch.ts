import { logger } from '../../../core/helpers.js'
import { Flashcore } from 'robo.js'
import { Colors } from 'discord.js'
import type { CommandInteraction } from 'discord.js'
import type { CommandConfig, CommandResult } from 'robo.js'

export const config: CommandConfig = {
	description: 'Watch for key changes',
	options: [
		{
			name: 'key',
			description: 'The key to watch',
			required: true
		},
		{
			name: 'remove',
			description: 'Whether to remove the watcher',
			type: 'boolean'
		},
		{
			name: 'namespace',
			description: 'The namespace to watch the key in'
		}
	]
}

export default (interaction: CommandInteraction): CommandResult => {
	const key = interaction.options.get('key')?.value as string
	const remove = interaction.options.get('remove')?.value as boolean
	const namespace = interaction.options.get('namespace')?.value as string

	// Remove the watcher if requested
	if (remove) {
		Flashcore.off(key, undefined, { namespace })
		return `Removed watcher for Flashcore key \`${key}\``
	}

	// Watch the key
	Flashcore.on(
		key,
		(oldValue, newValue) => {
			logger.custom('dev', `Flashcore.set(${key}):`, newValue, `- Old value:`, oldValue)

			// Render as fancy embed
			interaction.channel?.send({
				embeds: [
					{
						title: 'Flashcore - Key changed',
						description: `The value of key \`${key}\` has changed`,
						color: Colors.DarkNavy,
						fields: [
							{
								name: 'Old value',
								value: '`' + oldValue + '`'
							},
							{
								name: 'New value',
								value: '`' + newValue + '`'
							},
							{
								name: 'Namespace',
								value: namespace ?? 'none'
							}
						]
					}
				]
			})
		},
		{ namespace }
	)

	return `Now watching Flashcore key \`${key}\``
}
