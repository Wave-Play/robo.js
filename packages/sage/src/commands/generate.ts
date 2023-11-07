import { Command } from 'commander'
import { readFile, writeFile } from 'node:fs/promises'
import { logger } from '../core/logger.js'
import type { Manifest, CommandEntry, ContextEntry, EventConfig, CommandOption } from '@roboplay/robo.js'
import path from 'node:path'

const command = new Command('generate')
command.command('doc').description('generates a basic doc file for the project').action(generateDocAction)
export default command

async function generateDocAction() {
	try {
		const manifestPath = path.join(process.cwd(), '.robo', 'manifest.json')

		const manifest: Manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
		const manifestCommands: CommandEntry = manifest.commands
		const manifestEvents: EventConfig = manifest.events
		const manifestContextCommands: Record<string, ContextEntry> = manifest.context

		const displayOptions = (options: CommandOption[], required?: boolean): string => {
			const str: string[] = []
			if (options && options.length > 0) {
				options.forEach((option: CommandOption) => {
					if (required) {
						str.push(option.required.toString())
					} else {
						str.push(option.name)
					}
				})
			}
			return str.length > 0 ? str.join(',') : 'no options'
		}

		const displaySubcommand = (command: CommandEntry): string => {
			const subCommandsNames: string[] = []
			let subCommand: CommandEntry = command.subcommands
			while (subCommand) {
				subCommandsNames.push(Object.keys(subCommand)[0])
				const s: CommandEntry = Object.values(subCommand)[0]
				subCommand = s.subcommands
			}
			return subCommandsNames.join(' ')
		}

		let table = `# Slash commands:\n| Name |  Options  | Required | Description |\n| ----------- | ----------- | ----------- | ----------- |\n`

		for (const [commandKey, commandValue] of Object.entries(manifestCommands)) {
			const desc = commandValue.description ? commandValue.description : 'no description available'
			table += `|${commandKey} ${displaySubcommand(commandValue)}|${displayOptions(
				commandValue.options
			)}|${displayOptions(commandValue.options, true)}|${desc}|\n`
		}

		table +=
			'\n\n# Context commands:\n|Commands | Context | Description |\n| -----------  | ----------- | ----------- |\n'
		for (const [contextKey, contextValue] of Object.entries(manifestContextCommands)) {
			if (contextKey === 'user') {
				table += `\n\n|Commands | Context | Description |\n| -----------  | ----------- | ----------- |\n`
			}
			for (const [contextCommandKey, contextCommandValue] of Object.entries(contextValue)) {
				const desc = contextCommandValue.description ? contextCommandValue.description : 'no description available'
				table += `|${contextCommandKey}|${contextKey}|${desc}|\n`
			}
		}

		table += '\n\n# Events used:\n| Name |  Description |\n| ----------- | ----------- |\n'
		for (const [eventKey, eventValue] of Object.entries(manifestEvents)) {
			const desc = eventValue.description ? eventValue.description : 'no description available'
			table += `|${eventKey}|${desc}|\n`
		}

		await writeFile(path.join(process.cwd(), 'DOCUMENTATION.md'), table)
	} catch (e) {
		logger.error(e)
		process.exit(1)
	}
}
