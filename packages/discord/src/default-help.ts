// @ts-expect-error - This is valid once command file is parsed
import { client, getManifest } from '@roboplay/discord'
import type { CommandConfig } from './types/commands.js'

export const config: CommandConfig = {
	__auto: true,
	description: 'Displays a list of commands.'
}

export default () => {
	const manifest = getManifest()

	return {
		embeds: [
			{
				fields: [
					...Object.keys(manifest.commands).map((command) => ({
						name: `/${command}`,
						value: manifest.commands[command].description || 'No description provided.',
						inline: false
					})),
					{
						name: '\u200b', // Zero-width space
						value: 'Powered by [**RoboPlay** ✨](https://roboplay.dev)',
						inline: false
					}
				],
				provider: {
					// Hai, Discord developers! ヾ(＾∇＾)
					name: 'RoboPlay',
					url: 'https://roboplay.dev?ref=bot&tag=' + encodeURIComponent(client?.user?.tag)
				},
				color: 16771899,
				title: 'Commands'
			}
		]
	}
}
