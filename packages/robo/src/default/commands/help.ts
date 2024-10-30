// @ts-expect-error - This is valid once command file is parsed
import { getManifest } from 'robo.js'
import type { CommandConfig, CommandEntry } from '../../types/commands.js'

export const config: CommandConfig = {
	description: 'Displays a list of commands.'
}

function getInnermostCommands(
	commands: Record<string, CommandEntry>,
	prefix = ''
): { key: string; command: CommandEntry }[] {
	let innermostCommands: { key: string; command: CommandEntry }[] = []
	const keys = Object.keys(commands)

	for (const key of keys) {
		if (commands[key].subcommands) {
			const subInnermostCommands = getInnermostCommands(commands[key].subcommands, prefix ? `${prefix} ${key}` : key)
			innermostCommands = innermostCommands.concat(subInnermostCommands)
		} else {
			const commandPath = prefix ? `${prefix} ${key}` : key
			innermostCommands.push({ key: commandPath, command: commands[key] })
		}
	}

	return innermostCommands
}

export default () => {
	const manifest = getManifest()
	const commands = getInnermostCommands(manifest.commands)
	const poweredBy = process.env.ROBOPLAY_HOST
		? 'Powered by [**RoboPlay** ✨](https://roboplay.dev)'
		: 'Powered by [**Robo.js**](https://robojs.dev)'

	return {
		embeds: [
			{
				fields: [
					...commands.map(({ key, command }) => ({
						name: `/${key}`,
						value: command.description || 'No description provided.',
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
