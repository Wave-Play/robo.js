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

	public addCommand(command: Command): this {
		this._commands.push(command)
		command._parent = this
		return this
	}

	public allowSpacesInOptions(allow: boolean): this {
		this._allowSpacesInOptions = allow
		return this
	}

	public description(desc: string): this {
		this._description = desc
		return this
	}

	public getChildCommands(): Command[] {
		return this._commands
	}

	public positionalArgs(positionalArg: boolean): this {
		this._positionalArgs = positionalArg
		return this
	}

	public getParentCommand(): Command {
		return this._parent
	}

	public getName(): string {
		return this._name
	}

	public getDescription(): string {
		return this._description
	}

	public getOptions(): Option[] {
		return this._options
	}

	public option(alias: string, name: string, description: string, acceptsMultipleValues: boolean = false): this {
		this._options.push({ alias, name, description, acceptsMultipleValues })
		return this
	}

	public handler(fn: (args: string[], options: Record<string, unknown>) => void): this {
		this._handler = fn
		return this
	}

	public parse(): void {
		this.processSubCommand(this, process.argv.slice(2))
	}

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
