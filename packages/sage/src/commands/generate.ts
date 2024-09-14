import { Command } from 'commander'
import { writeFile } from 'node:fs/promises'
import { logger } from '../core/logger.js'
import type { Manifest, CommandEntry, ContextEntry, EventConfig, CommandOption } from 'robo.js'
import path from 'node:path'
import { Compiler } from 'robo.js/dist/cli/utils/compiler.js'

const command = new Command('generate')
command.command('docs').description('generates a basic doc file for the project').action(generateDocAction)
export default command

async function generateDocAction() {
	try {
		const manifest: Manifest = await Compiler.useManifest()
		const manifestCommands: CommandEntry = manifest.commands
		const manifestEvents: EventConfig = manifest.events
		const manifestContextCommands: Record<string, ContextEntry> = manifest.context

		let table = ''

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

		const displayCommands = (command: CommandEntry, commandKey?: string) => {
			const subCommandsNames: string[] = []
			let subCommand: CommandEntry = command.subcommands
			while (subCommand) {
				const s: CommandEntry = Object.values(subCommand)[0]
				if (s.subcommands === undefined) break
				subCommandsNames.push(Object.keys(subCommand)[0])
				subCommand = s.subcommands
			}

			const cmds = subCommand ? Object.entries(subCommand) : []
			if (cmds.length > 0) {
				cmds.forEach((command: [string, CommandEntry]) => {
					const desc = command[1].description ? command[1].description : 'no description available'
					table += `|${commandKey} ${subCommandsNames.join(' ')} ${command[0]}  |${displayOptions(
						command[1].options
					)}|${displayOptions(command[1].options, true)}|${desc}|\n`
				})
			} else {
				const desc = command.description ? command.description : 'no description available'
				table += `|${commandKey} ${subCommandsNames.join(' ')} |${displayOptions(command.options)}|${displayOptions(
					command.options,
					true
				)}|${desc}|\n`
			}
		}

		if (Object.entries(manifestCommands).length > 0) {
			table = `# Slash commands:\n| Name |  Options  | Required | Description |\n| ----------- | ----------- | ----------- | ----------- |\n`

			for (const [commandKey, commandValue] of Object.entries(manifestCommands)) {
				if (!commandValue['__auto']) {
					displayCommands(commandValue, commandKey)
				}
			}
		}

		for (const [contextKey, contextValue] of Object.entries(manifestContextCommands)) {
			if (Object.entries(contextValue).length > 0) {
				table +=
					'\n\n# Context commands:\n|Commands | Context | Description |\n| -----------  | ----------- | ----------- |\n'

				for (const [contextCommandKey, contextCommandValue] of Object.entries(contextValue)) {
					const desc = contextCommandValue.description ? contextCommandValue.description : 'no description available'
					table += `|${contextCommandKey}|${contextKey}|${desc}|\n`
				}
			}
		}

		if (Object.entries(manifestEvents).length > 0) {
			table += '\n\n# Events used:\n| Name |  Description |\n| ----------- | ----------- |\n'
			for (const [eventKey, eventValue] of Object.entries(manifestEvents)) {
				const desc = eventValue.description ? eventValue.description : 'no description available'
				table += `|${eventKey}|${desc}|\n`
			}
		}

		if (table.length > 0) {
			await writeFile(path.join(process.cwd(), 'DOCUMENTATION.md'), table)
		}
	} catch (e) {
		logger.error(e)
		process.exit(1)
	}
}
