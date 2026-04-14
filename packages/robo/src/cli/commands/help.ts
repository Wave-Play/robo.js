import { color } from '../../core/color.js'
import { Command, Option } from '../utils/cli-handler.js'
import { logger } from '../../core/logger.js'
import rootCommand from '../index.js'
import { packageJson } from '../utils/utils.js'
import type { CliContext } from '../../types/cli.js'

// cli-loader is lazy-loaded in showPluginCommands to avoid heavy startup cost

const command = new Command('help').description('Shows this help menu').handler(helpCommandHandler)
export default command

type CommandName =
	| 'add'
	| 'build'
	| 'plugin'
	| 'dev'
	| 'deploy'
	| 'help'
	| 'remove'
	| 'start'
	| 'upgrade'

interface CommandGroup {
	groupId: number
	command: Command
}

interface FormattedCommand {
	groupId: number
	name: CommandName
	flags: string
	description: string
}

/**
 * Function that is being called when we use the help command in the CLI.
 *
 */
export async function helpCommandHandler(_context: CliContext) {
	logger.log(
		color.bold(`\n ${color.blue('Robo.js')} - Where bot creation meets endless possibilities!`),
		color.dim('(v' + packageJson.version + ')\n\n')
	)

	// Load extensions for all core commands
	const extensionMap: Record<string, string[]> = {}
	try {
		const { loadCliManifest, getExtensions } = await import('../utils/cli-loader.js')
		const manifest = await loadCliManifest()
		if (manifest) {
			for (const cmd of rootCommand.getChildCommands()) {
				const exts = getExtensions(manifest, cmd.getName())
				if (exts.length > 0) {
					// Extract extension aliases
					const extAliases = exts.flatMap((e) => e.options?.map((o) => o.alias) || [])
					if (extAliases.length > 0) {
						extensionMap[cmd.getName()] = extAliases
					}
				}
			}
		}
	} catch {
		// Silently ignore manifest loading errors
	}

	const groups = splitCommandsIntoGroups([
		['dev', 'start', 'build'],
		['add', 'remove', 'upgrade'],
		['deploy'],
		['help']
	])
	prettyPrint(formatCommand(groups, extensionMap))

	// Show plugin commands if available
	await showPluginCommands()
}

/**
 * Splits the commands into seperate groups for meaningful printing.
 *
 * @param {commandNames} commandNames - Array containing arrays of command names.
 * @return {CommandGroup[]} - returns an array objects with the command and the groupId.
 */

function splitCommandsIntoGroups(commandNames: CommandName[][]): CommandGroup[] {
	const commands = rootCommand.getChildCommands().map((command: Command) => command)

	const orderedCommands: CommandGroup[] = []

	commandNames.forEach((commandsGroup, idx) => {
		const commandAndGroupId: CommandGroup[] = [];
		// find a way to get children commands of commands.
		commandsGroup.forEach((commandName: string): CommandGroup => {
			const command: Command[] = commands.filter((cmd: Command) => cmd.getName() === commandName)

			if (command.length <= 0) {
				logger.error(color.red(`The ${commandName} command doesn't exist\n`))
				return
			}
			commandAndGroupId.push({
				groupId: idx,
				command: command[0]
			})
		})
		orderedCommands.push(...commandAndGroupId)
	})
	return orderedCommands
}

/**
 * Prints everything in the CLI in a pwetty way uwu.
 *
 * @param {FormattedCommand[]} commands - Array of CustomCommandStructure.
 */
function prettyPrint(commands: FormattedCommand[]) {
	let commandNameStringLength = 0
	let commandOptionsStringLength = 0
	for (let i = 0; i < commands.length; ++i) {
		if (commandNameStringLength < commands[i].name.length) {
			commandNameStringLength = commands[i].name.length
		}
		if (commandOptionsStringLength < commands[i].flags.length) {
			commandOptionsStringLength = commands[i].flags.length
		}
	}

	for (let i = 0; i < commands.length; ++i) {
		const command = commands[i]
		const spacesBetweenNameAndFlags = calcSpacing(commandNameStringLength, command.name.length)
		const spaceBetweenFlagsAndDesc = calcSpacing(commandOptionsStringLength, command.flags.length)

		const spacingFlag = '\u0020'.repeat(spacesBetweenNameAndFlags + 5)
		const spacingDesc = '\u0020'.repeat(spaceBetweenFlagsAndDesc + 5)
		const commandLine = `${' ' + command.name}${spacingFlag + command.flags}${spacingDesc + command.description}`
		const lineBreakSpacesCount =
			command.name.length + spacingFlag.length + command.flags.length + spacingDesc.length + 1

		let nameColor = color.blue
		if (command.groupId === 2) {
			nameColor = color.green
		} else if (command.groupId === 3) {
			nameColor = color.magenta
		} else if (command.groupId >= 4) {
			nameColor = color.cyan
		}

		logger.log(
			nameColor(color.bold(' ' + command.name)),
			color.dim(spacingFlag + command.flags),
			color.white(spacingDesc + command.description.slice(0, 68))
		)

		if (commandLine.length >= 105) {
			breakLine(command.description, lineBreakSpacesCount, 70)
		}
	}

	logger.log('\n')
	logger.log(
		color.white(' Learn more about Robo.js:'),
		color.underline(color.italic(color.cyan('https://roboplay.dev/docs')))
	)
	logger.log(
		color.white(' Join our official Discord server:'),
		color.underline(color.italic(color.cyan('https://roboplay.dev/discord'))),
		'\n'
	)
}

/**
 * Calculates the spaces for even columns
 *
 * @param  {number} longestCommandName - Longest command name.
 * @param  {number} commandNameLength - Length of the Command name we are comparing it with.
 * @returns {number} - Returns the number of spaces we have to add to the string.
 */
function calcSpacing(longestCommandName: number, commandNameLength: number): number {
	let y = 0
	if (commandNameLength === longestCommandName) {
		return y
	}
	for (let i = commandNameLength; i < longestCommandName; ++i) {
		++y
	}
	return y
}

// Might wanna re-work that, it splits every "70~" characters. So it's not good for every string.
// Perhaps, adding strict grammar rules to the description might help with that.
// lineBreakSpaces is basically the spaces I need to reach until the "-" of a command description.

/**
 * Breaks the description into smaller lines to fit the CLi and aligns them.
 *
 * @param {string} desc - Description of the command.
 * @param {number} lineBreakSpaces - Number of spaces to add so the new line is aligned.
 * @param {number} charactersToDivideInto - Number of characters the strings should be divided in.
 *
 */
function breakLine(desc: string, lineBreakSpaces: number, charactersToDivideInto: number) {
	const numberOfDividedLines = Math.floor(desc.length / charactersToDivideInto)
	let d = 140
	for (let i = 0; i < numberOfDividedLines; ++i) {
		if (i === numberOfDividedLines) {
			logger.log('\u0020'.repeat(lineBreakSpaces), ' ' + desc.slice(d).trim())
			logger.log('\n')
			return
		} else if (d === 140) {
			logger.log('\u0020'.repeat(lineBreakSpaces), ' ' + desc.slice(68, 140).trim())
		} else {
			logger.log('\u0020'.repeat(lineBreakSpaces), ' ' + desc.slice(d - 70, d).trim())
		}
		d += 70
	}
}

/**
 * Formats the command into a structured Object.
 *
 * @param {commandGroup[]} commandGroup - Array of CommandGroup.
 * @param {Record<string, string[]>} extensionMap - Map of command names to extension aliases.
 * @returns {FormattedCommand[]} - Returns the commandGroup array in the shape of FormattedCommand array.
 */
function formatCommand(
	commandGroup: CommandGroup[],
	extensionMap: Record<string, string[]> = {}
): FormattedCommand[] {
	const formattedCommands: FormattedCommand[] = []

	commandGroup.forEach((commandObject: CommandGroup, idx: number) => {
		if (!commandObject?.command) return
		const childCommands = commandObject.command.getChildCommands()
		const cmdName = commandObject.command.getName()
		const coreAliases = commandObject.command.getOptions().map((flags: Option) => `${flags.alias}`)
		const extAliases = extensionMap[cmdName] || []
		const allAliases = [...coreAliases, ...extAliases]
		const alias = allAliases.join(' ')

		const lastCommandInTheGroup = () => {
			if (commandGroup[idx + 1] !== undefined && commandGroup[idx + 1].groupId !== commandObject.groupId) {
				return `${commandObject.command.getDescription()}\n\n`
			} else {
				return commandObject.command.getDescription()
			}
		}

		childCommands.forEach((childCommand: Command) => {
			formattedCommands.push({
				groupId: commandObject.groupId,
				name: `${commandObject.command.getName()} ${childCommand.getName()}` as CommandName,
				flags: alias,
				description: childCommand.getDescription()
			})
		})

		formattedCommands.push({
			groupId: commandObject.groupId,
			name: commandObject.command.getName() as CommandName,
			flags: alias,
			description: lastCommandInTheGroup()
		})
	})

	return formattedCommands
}

/**
 * Shows plugin-provided commands if any are available.
 */
async function showPluginCommands() {
	// Lazy-load cli-loader to avoid heavy startup cost (~190ms)
	const { loadCliManifest } = await import('../utils/cli-loader.js')
	const manifest = await loadCliManifest()

	if (!manifest || Object.keys(manifest.commands).length === 0) {
		return
	}

	const commands = Object.entries(manifest.commands)

	// Group commands by plugin
	const byPlugin = new Map<string, Array<{ name: string; description: string }>>()

	for (const [name, entry] of commands) {
		const source = entry.plugin ?? 'project'
		if (!byPlugin.has(source)) {
			byPlugin.set(source, [])
		}
		byPlugin.get(source)!.push({ name, description: entry.description })
	}

	logger.log(color.bold(color.yellow('\n Plugin Commands:\n')))

	for (const [source, cmds] of byPlugin) {
		logger.log(color.dim(` ${source}:`))
		for (const cmd of cmds) {
			const paddedName = cmd.name.padEnd(20)
			logger.log(`   ${color.cyan(paddedName)} ${color.white(cmd.description)}`)
		}
		logger.log('')
	}

	logger.log(color.dim(' Use "robo cli --inspect" for more details about plugin commands.\n'))
}
