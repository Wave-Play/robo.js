import { Command } from 'commander'
import { writeFile } from 'node:fs/promises'
import { logger } from '../core/logger.js'
import { Manifest } from 'robo.js'
import type { HandlerEntry } from 'robo.js'
import type { CommandOption } from '@robojs/discordjs'
import path from 'node:path'

const command = new Command('generate')
command
	.command('docs')
	.description('generates a basic doc file for the project')
	.option('-m --mode <mode>', 'specify the mode to use (default: production)')
	.action(generateDocAction)
export default command

interface GenerateOptions {
	mode?: string
}

async function generateDocAction(options: GenerateOptions) {
	try {
		// Initialize the Manifest API
		const mode = options.mode ?? 'production'
		await Manifest.initialize(mode)

		// Get commands, context menus, and events from the manifest
		const commands = await Manifest.routes('discordjs', 'commands')
		const contextMenus = await Manifest.routes('discordjs', 'context')
		const events = await Manifest.routes('discordjs', 'events')

		let table = ''

		const displayOptions = (cmdOptions?: CommandOption[], required?: boolean): string => {
			const str: string[] = []
			if (cmdOptions && cmdOptions.length > 0) {
				cmdOptions.forEach((option: CommandOption) => {
					if (required) {
						str.push(String(option.required ?? false))
					} else {
						str.push(option.name)
					}
				})
			}
			return str.length > 0 ? str.join(',') : 'no options'
		}

		// Filter out auto-generated commands and group by top-level command
		const userCommands = commands.filter((cmd) => !cmd.metadata?.auto && cmd.source === 'project')

		if (userCommands.length > 0) {
			table = `# Slash commands:\n| Name |  Options  | Required | Description |\n| ----------- | ----------- | ----------- | ----------- |\n`

			for (const cmd of userCommands) {
				const desc = (cmd.metadata?.description as string) || 'no description available'
				const cmdOptions = cmd.metadata?.options as CommandOption[] | undefined
				table += `|${cmd.key}|${displayOptions(cmdOptions)}|${displayOptions(cmdOptions, true)}|${desc}|\n`
			}
		}

		// Group context menus by type (user, message)
		const contextByType: Record<string, HandlerEntry[]> = {}
		for (const ctx of contextMenus) {
			if (ctx.metadata?.auto) continue
			const type = (ctx.extra?.type as string) || 'unknown'
			if (!contextByType[type]) {
				contextByType[type] = []
			}
			contextByType[type].push(ctx)
		}

		for (const [contextType, contextCommands] of Object.entries(contextByType)) {
			if (contextCommands.length > 0) {
				table +=
					'\n\n# Context commands:\n|Commands | Context | Description |\n| -----------  | ----------- | ----------- |\n'

				for (const ctx of contextCommands) {
					const desc = (ctx.metadata?.description as string) || 'no description available'
					table += `|${ctx.key}|${contextType}|${desc}|\n`
				}
			}
		}

		// Get unique events (by key)
		const uniqueEvents = new Map<string, HandlerEntry>()
		for (const event of events) {
			if (!uniqueEvents.has(event.key)) {
				uniqueEvents.set(event.key, event)
			}
		}

		if (uniqueEvents.size > 0) {
			table += '\n\n# Events used:\n| Name |  Description |\n| ----------- | ----------- |\n'
			for (const [eventKey, event] of uniqueEvents) {
				const desc = (event.metadata?.description as string) || 'no description available'
				table += `|${eventKey}|${desc}|\n`
			}
		}

		if (table.length > 0) {
			await writeFile(path.join(process.cwd(), 'DOCUMENTATION.md'), table)
			logger.info('Generated DOCUMENTATION.md')
		} else {
			logger.info('No commands, context menus, or events found to document.')
		}
	} catch (e) {
		logger.error(e)
		process.exit(1)
	}
}
