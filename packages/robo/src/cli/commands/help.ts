import { color } from '../../core/color.js'
import { Command, Option } from '../utils/cli-handler.js'
import { logger } from '../../core/logger.js'
import rootCommand from '../index.js'
import { packageJson } from '../utils/utils.js'

const command = new Command('help').description('Shows that menu').handler(help)
export default command

type commandName = 'build' | 'build plugin' | 'start' | 'dev' | 'deploy' | 'doctor' | 'invite' | 'why' | 'help'

interface CustomCommandStructure {
	commandName: commandName
	flags: string
	commandDescription: string
}

/**
 * Function that is being called when we use the help flag in the CLI.
 *
 */

function help() {
	logger.log(
		color.yellow(` ${color.blue('Robo.js')} - Where bot creation meets endless possibilities !`),
		color.gray('(' + packageJson.version + ')\n')
	)
	prettyPrint(customCommandStructure())
}

/**
 * Prints everything in the CLI in a good way.
 *
 * @param {CustomCommandStructure[]} - Array of CustomCommandStructure
 */
function prettyPrint(commands: CustomCommandStructure[]) {
	let commandName_string_length = 0
	let flags_string_length = 0
	commands.forEach((cmd) => {
		if (commandName_string_length < cmd.commandName.length) {
			commandName_string_length = cmd.commandName.length
		}
		if (flags_string_length < cmd.flags.length) {
			flags_string_length = cmd.flags.length
		}
	})
	commands.forEach((command) => {
		const spacesBetweenNameAndFlags = calcSpacing(commandName_string_length, command.commandName.length)
		const spaceBetweenFlagsAndDesc = calcSpacing(flags_string_length, command.flags.length)

		const spacingFlag = '\u0020'.repeat(spacesBetweenNameAndFlags + 5)
		const spacingDesc = '\u0020'.repeat(spaceBetweenFlagsAndDesc + 5)
		const commandLine = `${' ' + command.commandName}${spacingFlag + command.flags}${
			spacingDesc + command.commandDescription
		}`
		const lineBreakSpacesCount =
			command.commandName.length + spacingFlag.length + command.flags.length + spacingDesc.length + 1

		switch (command.commandName) {
			case 'dev':
			case 'start':
			case 'build plugin':
			case 'build': {
				if (commandLine.length >= 105) {
					logger.log(
						color.blue(color.bold(' ' + command.commandName)),
						color.gray(spacingFlag + command.flags),
						color.white(spacingDesc + command.commandDescription.slice(0, 68))
					)
					breakLine(command.commandDescription, lineBreakSpacesCount)
				} else {
					logger.log(
						color.blue(color.bold(' ' + command.commandName)),
						color.gray(spacingFlag + command.flags),
						color.white(spacingDesc + command.commandDescription)
					)
				}
				break
			}
			case 'deploy':
			case 'doctor':
			case 'invite':
			case 'why': {
				if (commandLine.length >= 105) {
					logger.log(
						color.green(color.bold(' ' + command.commandName)),
						color.gray(spacingFlag + command.flags),
						color.white(spacingDesc + command.commandDescription.slice(0, 68))
					)
					breakLine(command.commandDescription, lineBreakSpacesCount)
				} else {
					logger.log(
						color.green(color.bold(' ' + command.commandName)),
						color.gray(spacingFlag + command.flags),
						color.white(spacingDesc + command.commandDescription)
					)
				}
				break
			}
			case 'help': {
				logger.log('\n')
				return `${logger.log(
					color.magenta(color.bold(' ' + command.commandName)),
					color.gray(spacingFlag + command.flags),
					color.white(spacingDesc + command.commandDescription)
				)}`
			}
			default:
				break
		}
	})

	logger.log('\n')
	logger.log(
		color.white(' Learn more about Robo.js at:'),
		color.underline(color.italic(color.cyan('https://roboplay.dev/docs')))
	)
	logger.log(
		color.white(' Join our official discord at:'),
		color.underline(color.italic(color.cyan('https://roboplay.dev/discord'))),
		'\n'
	)
}

/**
 * Calculates the spaces for even columns
 *
 * @param  {number} longest - Longest command name.
 * @param  {number} commandNameLength - Length of the Command name we are comparing it with.
 * @returns {number} - Returns the number of spaces we have to add to the string.
 */
function calcSpacing(longest: number, commandNameLength: number): number {
	let y = 0
	if (commandNameLength === longest) {
		return y
	}
	for (let i = commandNameLength; i < longest; ++i) {
		y++
	}
	return y
}

// Might wanna re-work that, it splits every "70~" characters. So it's not good for every string.
// Perhaps, adding strict grammar rules to the description.
// line_break_spaces is basically the spaces I need to reach until the "-" of a command description.

/**
 * Breaks the description into smaller lines to fit the CLi and aligns them.
 *
 * @param {string} desc - Description of the command.
 * @param {number} lineBreakSpaces - Number of spaces to add so the line break is aligned.
 * @returns
 */
function breakLine(desc: string, lineBreakSpaces: number) {
	const dividedLines = Math.floor(desc.length / 70)
	let d = 140
	for (let i = 0; i < dividedLines; ++i) {
		if (i === dividedLines) {
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
 * Constructs an Object with all the fields required to print out.
 *
 * @returns {CustomCommandStructure[]} - Returns an array of CustomCommandStructure
 */
function customCommandStructure(): CustomCommandStructure[] {
	const commands = rootCommand.getChildCommands()

	const map = commands.map((command: Command): CustomCommandStructure => {
		const commandName = command.getName()
		const seperatingTopAndMiddle = commandName === 'dev' ? `${command.getDescription()}\n\n` : command.getDescription()
		const pluginBuild = commandName === 'plugin' ? `build plugin` : commandName
		const alias = command
			.getOptions()
			.map((flags: Option) => `${flags.alias} ${flags.name}`)
			.join(' ')

		return {
			commandName: pluginBuild as commandName,
			flags: alias,
			commandDescription: seperatingTopAndMiddle
		}
	})

	return map
}
