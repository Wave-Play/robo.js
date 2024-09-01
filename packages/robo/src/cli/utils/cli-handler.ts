import { color } from '../../core/color.js'
import { logger } from '../../core/logger.js'

export interface Option {
	alias: string
	name: string
	description: string
}

export class Command {
	private _name: string
	private _description: string
	private _handler: (args: string[], options: Record<string, unknown>) => Promise<void> | void
	private _options: Option[] = []
	private _commands: Command[] = []
	private _version?: string
	private _positionalArgs?: boolean
	private _allowSpacesInOptions: boolean = true
	protected _parent?: Command

	constructor(name: string) {
		this._name = name
		this._handler = () => {
			/* empty */
		}
	}

	/**
	 * Add a subcommand to the current command.
	 *
	 * @param {Command} command - Command object to be added as a subcommand.
	 * @returns {Command} - Returns the current Command object for chaining.
	 */
	public addCommand(command: Command): this {
		this._commands.push(command)
		command._parent = this
		return this
	}

	/**
	 * Enable or disable spaces in options.
	 *
	 * @param {boolean} allow - Boolean to allow or disallow spaces in option values.
	 * @returns {Command} - Returns the current Command object for chaining.
	 */
	public allowSpacesInOptions(allow: boolean): this {
		this._allowSpacesInOptions = allow
		return this
	}

	/**
	 * Set the description for the command.
	 *
	 * @param {string} desc - Description string.
	 * @returns {Command} - Returns the current Command object for chaining.
	 */
	public description(desc: string): this {
		this._description = desc
		return this
	}

	/**
	 * Gets the children commands of the current command.
	 *
	 * @returns {Command[]} - Get the children commands of the current command.
	 */
	public getChildCommands(): Command[] {
		return this._commands
	}

	/**
	 * Set the value for positionalArgs.
	 *
	 * @param {boolean} positionalArg - positionalArgs boolean.
	 * @returns {Command} - Returns the current Command object for chaining.
	 */
	public positionalArgs(positionalArg: boolean): this {
		this._positionalArgs = positionalArg
		return this
	}

	/**
	 * Gets the parent command.
	 *
	 * @returns {Command} - Returns the parent command.
	 */
	public getParentCommand(): Command {
		return this._parent
	}

	/**
	 * Returns the name of the current command.
	 *
	 * @returns {string} - Returns the name of the command.
	 */
	public getName(): string {
		return this._name
	}

	/**
	 * Returns the description of the current command.
	 *
	 * @returns {string} - Returns the description of the current command.
	 */
	public getDescription(): string {
		return this._description
	}

	/**
	 * Returns the options of the current command.
	 *
	 * @returns {Option[]} - Returns the options of the current command.
	 */
	public getOptions(): Option[] {
		return this._options
	}

	/**
	 * Add an option for the command.
	 *
	 * @param {string} alias - Option alias (short form).
	 * @param {string} name - Option name (long form).
	 * @param {string} description - Option description.
	 * @returns {Command} - Returns the current Command object for chaining.
	 */
	public option(alias: string, name: string, description: string): this {
		this._options.push({ alias, name, description })
		return this
	}

	/**
	 * Assign a handler function for the command.
	 *
	 * @param {(args: string[], options: Record<string, unknown>) => void} fn - Function to be executed when the command is called.
	 * @returns {Command} - Returns the current Command object for chaining.
	 */
	public handler(fn: (args: string[], options: Record<string, unknown>) => void): this {
		this._handler = fn
		return this
	}

	/**
	 * Parse the command line arguments and process the command.
	 */
	public parse(): void {
		this.processSubCommand(this, process.argv.slice(2))
	}

	/**
	 * Assign a version string to the command and adds an option to display the version.
	 *
	 * @param {string} versionString - Version string.
	 * @returns {Command} - Returns the current Command object for chaining.
	 */
	public version(versionString: string): Command {
		this._version = versionString
		this.option('-v', '--version', 'Display the current version')
		return this
	}

	private showHelp(): void {
		console.log(color.blue(`\n Command: ${this._name}`))
		console.log(` Description: ${this._description}`)

		if (this._options.length > 0) {
			logger.log(color.green(` Options:`))
			this._options.forEach((opt) => {
				logger.log(
					`${color.white(
						`   ${color.green(`${opt.alias}`)}${color.white(',')} ${color.green(`${opt.name}`)}: ${opt.description}`
					)}`
				)
			})
			logger.log(`\n`)
		}

		if (this._commands.length > 0) {
			logger.log(color.red(` Subcommands:`))
			this._commands.forEach((cmd) => {
				logger.log(`${color.white(`   ${cmd._name}: ${cmd._description}`)}`)
			})
			logger.log(`\n`)
		}
	}

	/**
	 * Parses the options from the provided arguments array.
	 *
	 * @param {string[]} args - The arguments array.
	 * @returns {Record<string, unknown>} - Returns an object containing parsed options.
	 */
	private parseOptions(args: string[]): Record<string, unknown> {
		const options: Record<string, unknown> = {}
		let i = 0

		while (i < args.length) {
			const arg = args[i]

			if (arg.startsWith('--')) {
				const option = this._options.find((opt) => opt.name === arg)
				if (option) {
					if (this._allowSpacesInOptions && i + 1 < args.length && !args[i + 1].startsWith('-')) {
						let value = args[i + 1]
						i += 2 // Move past the option and its value
						while (i < args.length && !args[i].startsWith('-')) {
							value += ` ${args[i]}`
							i++
						}
						options[arg.slice(2)] = value
					} else {
						options[arg.slice(2)] = true
						i++
					}
				} else {
					i++
				}
			} else if (arg.startsWith('-')) {
				const option = this._options.find((opt) => opt.alias === arg)
				if (option) {
					if (this._allowSpacesInOptions && i + 1 < args.length && !args[i + 1].startsWith('-')) {
						let value = args[i + 1]
						i += 2 // Move past the option and its value
						while (i < args.length && !args[i].startsWith('-')) {
							value += ` ${args[i]}`
							i++
						}
						options[option.name.slice(2)] = value
					} else {
						options[option.name.slice(2)] = true
						i++
					}
				} else {
					i++
				}
			} else {
				i++
			}
		}

		return options
	}

	private async processSubCommand(command: Command, args: string[]) {
		// If there are no arguments provided, and the current command does not have a handler,
		// it means there's nothing to process further. Hence, return early.
		if (args.length === 0 && !command._handler) {
			return
		}

		const positionalArgs: string[] = []
		let optionsArgsStart = args.length

		for (let i = 0; i < args.length; i++) {
			const arg = args[i]

			// Check if arg is an option
			if (arg.startsWith('-')) {
				optionsArgsStart = i
				break
			}

			// If arg is prefixed with 'arg:', treat as a positional argument
			if (arg.startsWith('arg:')) {
				positionalArgs.push(arg.slice(4))
				continue
			}

			// Check if arg is a subcommand
			const subCommand = command._commands.find((cmd) => cmd._name === arg)
			if (subCommand) {
				const { positionalArgs: subPosArgs, optionsArgs: subOptArgs } = this.splitArgs(args.slice(i + 1))
				this.processSubCommand(subCommand, [...subPosArgs, ...subOptArgs])
				return
			}

			// If arg is not an option or a subcommand, treat as a positional argument
			positionalArgs.push(arg)

			// if _positionalArgs is false show a message to inform the user.
			if (!command._positionalArgs) {
				logger.log('\n')
				logger.error(color.red(`The command "${arg}" does not exist.`))
				logger.info(`Try ${color.bold(color.blue('robo --help'))} to see all available commands.`)
				logger.log('\n')
				return
			}
		}

		const optionsArgs = args.slice(optionsArgsStart)
		const parsedOptions = command.parseOptions(optionsArgs)

		if (parsedOptions.help) {
			command.showHelp()
			return
		}

		// If the current command has a version, and the user has provided the version flag, display the version and exit.
		if (command._commands.length && command._version && (args.includes('-v') || args.includes('--version'))) {
			console.log(command._version)
			process.exit(0)
		}

		await command._handler(positionalArgs, parsedOptions)
	}

	private splitArgs(args: string[]): { positionalArgs: string[]; optionsArgs: string[] } {
		const positionalArgs: string[] = []
		let optionsArgsStart = args.length

		for (let i = 0; i < args.length; i++) {
			const arg = args[i]

			// Check if arg is an option
			if (arg.startsWith('-')) {
				optionsArgsStart = i
				break
			}

			// If arg is not an option, treat as a positional argument
			positionalArgs.push(arg)
		}

		const optionsArgs = args.slice(optionsArgsStart)

		return { positionalArgs, optionsArgs }
	}
}
