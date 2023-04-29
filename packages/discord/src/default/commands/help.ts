// @ts-expect-error - This is valid once command file is parsed
import { getManifest } from '@roboplay/robo.js'
import type { CommandConfig } from '../../types/commands.js'

export const config: CommandConfig = {
	__auto: true,
	description: 'Displays a list of commands.'
}

export default () => {
	const manifest = getManifest()
	const poweredBy = process.env.ROBOPLAY_HOST
		? 'Powered by [**RoboPlay** ✨](https://roboplay.dev)'
		: 'Powered by [**Robo.js**](https://roboplay.dev/robo)'

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
						value: poweredBy,
						inline: false
					}
				],
				color: 16771899,
				title: 'Commands'
			}
		]
	}
}
