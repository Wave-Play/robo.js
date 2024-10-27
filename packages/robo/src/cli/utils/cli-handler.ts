import { color } from '../../core/color.js'
import { logger } from '../../core/logger.js'

export interface Option {
	alias: string
	name: string
	description: string
	acceptsMultipleValues?: boolean
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
	public option(alias: string, name: string, description: string, acceptsMultipleValues: boolean = false): this {
		this._options.push({ alias, name, description, acceptsMultipleValues })
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
	private parseOptions(args: string[]): { options: Record<string, unknown>; index: number } {
		const options: Record<string, unknown> = {}
		let i = 0

		while (i < args.length) {
			const arg = args[i]

			if (arg === '--') {
				i++ // Skip '--'
				break // End of options
			}

			if (arg.startsWith('--')) {
				const option = this._options.find((opt) => opt.name === arg)
				if (option) {
					if (option.acceptsMultipleValues) {
						const values: string[] = []
						i++ // Move past the option
						while (i < args.length && !args[i].startsWith('-') && args[i] !== '--') {
							values.push(args[i])
							i++
						}
						options[arg.slice(2)] = values
					} else if (this._allowSpacesInOptions && i + 1 < args.length && !args[i + 1].startsWith('-')) {
						options[arg.slice(2)] = args[i + 1]
						i += 2 // Skip over option and its single value
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
					if (option.acceptsMultipleValues) {
						const values: string[] = []
						i++ // Move past the option
						while (i < args.length && !args[i].startsWith('-') && args[i] !== '--') {
							values.push(args[i])
							i++
						}
						options[option.name.slice(2)] = values
					} else if (this._allowSpacesInOptions && i + 1 < args.length && !args[i + 1].startsWith('-')) {
						options[option.name.slice(2)] = args[i + 1]
						i += 2 // Skip over option and its single value
					} else {
						options[option.name.slice(2)] = true
						i++
					}
				} else {
					i++
				}
			} else {
				break // Stop parsing options when encountering positional arguments
			}
		}

		return { options, index: i }
	}

	private async processSubCommand(command: Command, args: string[]) {
		// If there are no arguments provided, and the current command does not have a handler,
		// it means there's nothing to process further. Hence, return early.
		if (args.length === 0 && !command._handler) {
			return
		}

		const { options, index } = command.parseOptions(args)
		const positionalArgs = args.slice(index)

		if (options.help) {
			command.showHelp()
			return
		}

		if (command._version && (options.version || options.v)) {
			console.log(command._version)
			process.exit(0)
		}

		// Process subcommands if any
		if (positionalArgs.length > 0) {
			const subCommandName = positionalArgs[0]
			const subCommand = command._commands.find((cmd) => cmd._name === subCommandName)
			if (subCommand) {
				await this.processSubCommand(subCommand, positionalArgs.slice(1))
				return
			} else if (!command._positionalArgs) {
				logger.log('\n')
				logger.error(color.red(`The command "${subCommandName}" does not exist.`))
				logger.info(`Try ${color.bold(color.blue('robo --help'))} to see all available commands.`)
				logger.log('\n')
				return
			}
		}

		await command._handler(positionalArgs, options)
	}
}
