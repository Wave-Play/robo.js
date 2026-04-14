import { color } from '../../core/color.js'
import { logger as createLogger } from '../../core/logger.js'
import { parseCliOptions } from './cli-shared.js'
import type { CliContext, CliOptionConfig } from '../../types/cli.js'

const logger = createLogger()

export interface Option extends CliOptionConfig {
	// CliOptionConfig already has: alias, name, description, type?, default?, required?
}

/**
 * Callback for handling unknown commands.
 * Return true if the command was handled, false otherwise.
 */
export type UnknownCommandHandler = (
	commandParts: string[],
	args: string[]
) => Promise<boolean> | boolean

export class Command {
	private _name: string
	private _description: string
	private _handler: (context: CliContext) => Promise<void> | void
	private _options: Option[] = []
	private _commands: Command[] = []
	private _version?: string
	private _positionalArgs?: boolean
	private _allowSpacesInOptions: boolean = true
	private _suppressUnknownWarnings: boolean = false
	protected _parent?: Command
	private _unknownCommandHandler?: UnknownCommandHandler

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
	 * Suppress warnings for unknown options during initial parsing.
	 * Useful for lazy commands where extensions may add additional options.
	 *
	 * @param {boolean} suppress - Boolean to suppress or show unknown option warnings.
	 * @returns {Command} - Returns the current Command object for chaining.
	 */
	public suppressUnknownWarnings(suppress: boolean): this {
		this._suppressUnknownWarnings = suppress
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
	 * @param {string | Option} aliasOrOption - Option alias (short form) or full Option object.
	 * @param {string} [name] - Option name (long form).
	 * @param {string} [description] - Option description.
	 * @returns {Command} - Returns the current Command object for chaining.
	 */
	public option(aliasOrOption: string | Option, name?: string, description?: string): this {
		if (typeof aliasOrOption === 'object') {
			this._options.push(aliasOrOption)
		} else {
			this._options.push({ alias: aliasOrOption, name: name!, description: description! })
		}
		return this
	}

	/**
	 * Assign a handler function for the command.
	 *
	 * @param {(context: CliContext) => void} fn - Function to be executed when the command is called.
	 * @returns {Command} - Returns the current Command object for chaining.
	 */
	public handler(fn: (context: CliContext) => Promise<void> | void): this {
		this._handler = fn
		return this
	}

	/**
	 * Set a callback to handle unknown commands.
	 * The callback receives the command parts and remaining args.
	 * Return true if handled, false to show the default error.
	 *
	 * @param {UnknownCommandHandler} fn - Function to handle unknown commands.
	 * @returns {Command} - Returns the current Command object for chaining.
	 */
	public onUnknownCommand(fn: UnknownCommandHandler): this {
		this._unknownCommandHandler = fn
		return this
	}

	/**
	 * Returns the handler function of the current command.
	 *
	 * @returns The handler function, or undefined if not set.
	 */
	public getHandler(): ((context: CliContext) => Promise<void> | void) | undefined {
		return this._handler
	}

	/**
	 * Parse the command line arguments and process the command.
	 *
	 * @param {string[]} [argv] - Optional arguments to parse. Defaults to process.argv.slice(2).
	 */
	public parse(argv?: string[]): void {
		this.processSubCommand(this, argv ?? process.argv.slice(2))
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

	private async showHelp(): Promise<void> {
		console.log(color.blue(`\n Command: ${this._name}`))
		console.log(` Description: ${this._description}`)

		// Load extension options
		let allOptions = [...this._options]
		const extensionSources: Map<string, string> = new Map()

		try {
			const { loadCliManifest, getExtensions, mergeOptions } = await import('./cli-loader.js')
			const manifest = await loadCliManifest()
			if (manifest) {
				const extensions = getExtensions(manifest, this._name)
				if (extensions.length > 0) {
					// Track which options come from which plugins
					for (const ext of extensions) {
						if (ext.options) {
							for (const opt of ext.options) {
								extensionSources.set(opt.name, ext.plugin ?? 'plugin')
							}
						}
					}
					allOptions = mergeOptions(this._options, extensions)
				}
			}
		} catch {
			// Silently ignore manifest loading errors
		}

		if (allOptions.length > 0) {
			logger.log(color.green(` Options:`))
			const coreOptionNames = new Set(this._options.map((o) => o.name))

			for (const opt of allOptions) {
				const isExtension = !coreOptionNames.has(opt.name) && opt.name !== '--help'
				const source = extensionSources.get(opt.name)
				const suffix = isExtension && source ? color.dim(` (from ${source})`) : ''
				logger.log(
					`${color.white(
						`   ${color.green(`${opt.alias}`)}${color.white(',')} ${color.green(`${opt.name}`)}: ${opt.description}`
					)}${suffix}`
				)
			}
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
	 * Parses the options from the provided arguments array using the shared parser.
	 *
	 * @param {string[]} args - The arguments array.
	 * @returns {{ parsedOptions: Record<string, unknown>; positionalArgs: string[]; errors: string[] }}
	 */
	private parseOptions(args: string[]): {
		parsedOptions: Record<string, unknown>
		positionalArgs: string[]
		errors: string[]
	} {
		return parseCliOptions(args, this._options, {
			allowSpacesInOptions: this._allowSpacesInOptions,
			suppressUnknownWarnings: this._suppressUnknownWarnings
		})
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

			// if _positionalArgs is false, check for unknown command handler or show error
			if (!command._positionalArgs) {
				// Try the unknown command handler first (for plugin commands)
				if (this._unknownCommandHandler) {
					const handled = await this._unknownCommandHandler(positionalArgs, args.slice(i + 1))
					if (handled) {
						return
					}
				}

				logger.log('\n')
				logger.error(color.red(`The command "${arg}" does not exist.`))
				logger.info(`Try ${color.bold(color.blue('robo --help'))} to see all available commands.`)
				logger.log('\n')
				return
			}
		}

		const optionsArgs = args.slice(optionsArgsStart)
		const { parsedOptions, positionalArgs: additionalArgs, errors } = command.parseOptions(optionsArgs)

		// Merge positional args from before options with any found during parsing
		const allPositionalArgs = [...positionalArgs, ...additionalArgs]

		if (parsedOptions.help || (!command._suppressUnknownWarnings && args.includes('--help'))) {
			await command.showHelp()
			return
		}

		// If the current command has a version, and the user has provided the version flag, display the version and exit.
		if (command._commands.length && command._version && (args.includes('-v') || args.includes('--version'))) {
			console.log(command._version)
			process.exit(0)
		}

		// Handle validation errors
		if (errors.length > 0) {
			for (const error of errors) {
				logger.error(error)
			}
			logger.log('')
			logger.info(`Use ${color.bold('--help')} to see available options.`)
			return
		}

		// Create CliContext for the handler
		const context: CliContext = {
			args: allPositionalArgs,
			options: parsedOptions,
			logger: logger,
			cwd: process.cwd(),
			argv: args
		}

		await command._handler(context)
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
