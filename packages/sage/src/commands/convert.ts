import { Command } from 'commander'
import { access, mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import type { PackageJson } from '../core/types.js'
import { cmd, exec, getPackageExecutor } from '../core/utils.js'
import { logger } from '../core/logger.js'
import {
	ArrowFunctionExpression,
	AssignmentExpression,
	AssignmentPatternProperty,
	BindingIdentifier,
	CallExpression,
	ExprOrSpread,
	ExpressionStatement,
	FunctionExpression,
	Identifier,
	KeyValueProperty,
	MemberExpression,
	MethodProperty,
	NewExpression,
	ObjectExpression,
	ObjectPattern,
	ObjectPatternProperty,
	OptionalChainingCall,
	Param,
	Property,
	SpreadElement,
	Statement,
	StringLiteral,
	TsKeywordType,
	TsTypeReference,
	VariableDeclaration,
	VariableDeclarator,
	parseSync
} from '@swc/core'
import { exit } from 'node:process'

const command = new Command('convert')
	.description('Converts your discord.js project into a Robo.js one')
	.option('-v --verbose', 'print more information for debugging')
	.action(convertAction)
export default command

interface PackageInfo {
	hasTypescript: boolean
	hasDiscord: boolean
}

interface ExtractEvents {
	parameters: Array<string> | undefined
	isAsync: boolean
	name: string
	cb: string
}

interface ExtractCommand {
	parameters: Array<string>
	cb: string
	isAsync: boolean
}

type choicesObjectType = Array<{ name: string; value: string }>

interface CommandOptions {
	optionName: string
	optionType: string
	description: string
	isRequired: boolean
	localizationParameters: { name: undefined | string; description: undefined | string }
	maxLength: undefined | number
	channelType: undefined | string
	choices: choicesObjectType
}

interface Subcommand {
	subCommandName: string
	subCommandDescription: string
	optionGlobalType: string
	options: CommandOptions[]
}

interface CommandAndSubcommands {
	parentCommand: string
	parentCommandDescription: string
	options: CommandOptions[]
	subcommands: Array<Subcommand>
}

async function convertAction() {
	const packageExecutor = getPackageExecutor()
	const botName = path.basename(path.resolve())
	const tsconfig = await access(path.join(process.cwd(), 'tsconfig.json'))
		.then(() => true)
		.catch(() => false)

	const packageJsonPath = path.join(process.cwd(), 'package.json')
	const packageJson: PackageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'))
	const packageInfo: PackageInfo = {
		hasTypescript: packageJson.devDependencies
			? !!packageJson.devDependencies['typescript']
			: !!packageJson.dependencies['typescript'],
		hasDiscord: !!packageJson.dependencies['discord.js']
	}

	if (!packageInfo.hasDiscord) {
		logger.error('Not a discord project ! aborting...')
		exit(1)
	}
	const packageName = 'robo-' + botName
	const exportPath: string = path.join(process.cwd(), '..', packageName)
	const isTypescript = tsconfig || packageInfo.hasTypescript ? true : false
	const main = await readFile(path.join(process.cwd(), `main.${packageInfo.hasTypescript ? 'ts' : 'js'}`), 'utf-8')

	//const { events, intents } = await extractEventsAndIntents(main, isTypescript)
	//const importStatement = await buildImportStatement(intents)

	/*mkdir(exportPath, { recursive: true })
	await exec(`${cmd(packageExecutor)} create-robo ${isTypescript ? '--typescript' : ''}`, {
		cwd: exportPath
	})*/

	await convertCommandsfilesIntoRobo(isTypescript, exportPath)
	//await createEventFiles(events, isTypescript, exportPath)
}

async function generateCommandObject(commandDiscord: CommandAndSubcommands | Subcommand): Promise<string> {
	const options = commandDiscord.options.map((option: CommandOptions) => {
		return {
			name: option.optionName,
			description: option.description,
			type: option.optionType,
			required: option.isRequired,
			choices: option.choices
		}
	})

	const isCommandOrSubcommand = isSubcommand(commandDiscord)

	const commandObject = `export const config = { 
		description: "${
			isCommandOrSubcommand ? commandDiscord.subCommandDescription : commandDiscord.parentCommandDescription
		}",
		dmPermission: false,
		options: ${JSON.stringify(options)}
	}`

	return commandObject
}

interface BodyExpressedInterface extends CallExpression {
	callee: MemberExpression & {
		object: NewExpression
	}
}

async function processCommands(rawString: string, isTypescript: boolean): Promise<CommandAndSubcommands> {
	const body: Statement[] = parseSync(rawString, {
		syntax: isTypescript ? 'typescript' : 'ecmascript',
		comments: true,
		script: true,
		target: 'es2021',
		isModule: false
	}).body
	const bodyFirstArgsCastedAsStatement = body[0] as Statement
	const bodyFirstArgsCastedAsExpressionStmt = bodyFirstArgsCastedAsStatement as ExpressionStatement
	const bodyExpression = bodyFirstArgsCastedAsExpressionStmt.expression as BodyExpressedInterface
	let cmd = isExtendedCallExpression(bodyExpression) ? bodyExpression : (bodyExpression as NewExpression)

	const commands: CommandAndSubcommands = {
		parentCommand: '',
		parentCommandDescription: '',
		options: [],
		subcommands: []
	}

	const r = async (commandObject: BodyExpressedInterface | NewExpression) => {
		if (commandObject === undefined || commandObject.arguments === undefined) return
		commandObject = commandObject as NewExpression
		const bodyExpression = commandObject.arguments[0]?.expression as ArrowFunctionExpression

		let commandArgument = bodyExpression?.body ? (bodyExpression.body as CallExpression) : commandObject

		const commandObjectCastedAsMemberExpr = commandObject.callee as MemberExpression
		const commandObjectCastedAsIdentifier = commandObjectCastedAsMemberExpr.property as Identifier
		const commandObjectPropertyValue = commandObjectCastedAsIdentifier?.value
		// gotta always go a level deeper than before down to the ocean floor.
		const subCommand: Subcommand = {
			subCommandName: '',
			subCommandDescription: '',
			optionGlobalType: commandObjectPropertyValue,
			options: []
		}

		while (commandArgument) {
			if (
				commandArgument.arguments !== undefined &&
				commandArgument.arguments[0] !== undefined &&
				commandArgument.arguments[0].expression !== undefined
			) {
				const cmdArgExprCastedAsAFE = commandArgument.arguments[0].expression as ArrowFunctionExpression
				const cmdArgExprParam = cmdArgExprCastedAsAFE.params
				if (cmdArgExprParam !== undefined) {
					let sub = cmdArgExprCastedAsAFE.body as CallExpression
					// add type of the event !
					const commandOptions: CommandOptions = {
						optionName: '',
						optionType: processOptionType(commandObjectPropertyValue),
						description: '',
						isRequired: false,
						localizationParameters: { name: undefined, description: undefined },
						maxLength: undefined,
						channelType: undefined,
						choices: []
					}

					while (sub) {
						if (sub && sub.arguments && sub.arguments.length > 0 && sub.arguments[0].expression !== undefined) {
							const subArgExprCastedAsAFE = sub.arguments[0].expression as ArrowFunctionExpression
							const subArgExprParam = subArgExprCastedAsAFE.params

							if (subArgExprParam === undefined) {
								const subArgumentExpression = sub.arguments[0].expression as Identifier
								const subCallee = sub.callee as MemberExpression
								const subCalleeProperty = subCallee.property as Identifier

								const fieldValue = subArgumentExpression.value
								const fieldObject = subCalleeProperty.value
								processOptions(fieldValue, fieldObject, commandOptions, subCommand, sub)
							}
						}
						const subAsMemberExpr = sub.callee as MemberExpression
						sub = subAsMemberExpr?.object as CallExpression
					}
				}
			}

			if (
				commandArgument &&
				commandArgument.arguments &&
				commandArgument.arguments.length > 0 &&
				commandArgument.arguments[0].expression !== undefined
			) {
				const cmdArgExprCastedAsAFE = commandArgument.arguments[0].expression as ArrowFunctionExpression
				const cmdArgExprParam = cmdArgExprCastedAsAFE.params

				if (cmdArgExprParam === undefined) {
					const cmdArgumentExpression = commandArgument.arguments[0].expression as Identifier
					const cmdCallee = commandArgument.callee as MemberExpression
					const cmdCalleeProperty = cmdCallee.property as Identifier

					const fieldValue = cmdArgumentExpression.value
					const fieldObject = cmdCalleeProperty.value
					const isSubcommand = commandObjectPropertyValue === 'addSubcommand'

					let commandArgs = commandArgument

					const commandOptions: CommandOptions = {
						optionName: '',
						optionType: processOptionType(commandObjectPropertyValue),
						description: '',
						isRequired: false,
						localizationParameters: { name: undefined, description: undefined },
						maxLength: undefined,
						channelType: undefined,
						choices: []
					}

					while (commandArgs) {
						if (
							commandArgs &&
							commandArgs.arguments &&
							commandArgs.arguments.length > 0 &&
							commandArgs.arguments[0].expression !== undefined
						) {
							// convert values under so they are typesafe I wanna KMS please help
							const cmdArgExprCastedAsAFE = commandArgs.arguments[0].expression as ArrowFunctionExpression
							const cmdArgExprParam = cmdArgExprCastedAsAFE.params

							if (cmdArgExprParam === undefined && commandObjectPropertyValue !== 'addSubcommand') {
								const cmdArgumentExpression = commandArgs.arguments[0].expression as Identifier
								const cmdCallee = commandArgs.callee as MemberExpression
								const cmdCalleeProperty = cmdCallee.property as Identifier

								const wfieldValue = cmdArgumentExpression.value
								const wfieldObject = cmdCalleeProperty?.value

								processOptions(wfieldValue, wfieldObject, commandOptions, commands, commandArgs)
							}
						}
						const commandsArgsAsMemberExpr = commandArgs.callee as MemberExpression
						commandArgs = commandsArgsAsMemberExpr?.object as CallExpression
					}

					// that if is part of the if under it, for some reasons
					// it's only working like that.
					if (fieldObject === 'setDescription') {
						subCommand.subCommandDescription = fieldValue
					}
					if (isSubcommand) {
						if (fieldObject === 'setName') {
							subCommand.subCommandName = fieldValue
						}

						if (
							subCommand.subCommandName !== '' &&
							commands.subcommands.filter((command: Subcommand) => command.subCommandName === subCommand.subCommandName)
								.length <= 0
						) {
							commands.subcommands.push(subCommand)
						}
					} else {
						if (fieldObject === 'setName') {
							commands.parentCommand = fieldValue
						}

						if (fieldObject === 'setDescription') {
							commands.parentCommandDescription = fieldValue
						}
					}
				}
			}
			const commandArgumentAsMemberExpre = commandArgument.callee as MemberExpression
			commandArgument = commandArgumentAsMemberExpre?.object as CallExpression
		}
		cmd = cmd as BodyExpressedInterface
		if (cmd && cmd.callee) {
			cmd = cmd.callee.object
			r(cmd)
		}
	}
	await r(cmd)

	commands.options = commands.options.filter((option: CommandOptions) => option.optionName !== commands.parentCommand)
	return commands
}

function processOptionType(option: string) {
	switch (option) {
		case 'addStringOption': {
			return 'string'
		}
		case 'addUserOption': {
			return 'user'
		}
		case 'addBooleanOption': {
			return 'boolean'
		}
		case 'addIntegerOption': {
			return 'integer'
		}
		case 'addNumberOption': {
			return 'number'
		}
		case 'addChannelOption': {
			return 'channel'
		}
		case 'addRoleOption': {
			return 'role'
		}
		case 'addMentionableOption': {
			return 'mentionable'
		}
		case 'addAttachmentOption': {
			return 'attachment'
		}

		default:
			break
	}
}

let offset = 0
async function convertCommandToESM(
	rawString: string,
	isTypescript: boolean
): Promise<{ commandBody: ExtractCommand; statementsArray: Array<string>; commands: CommandAndSubcommands }> {
	const body: Statement[] = parseSync(rawString, {
		syntax: isTypescript ? 'typescript' : 'ecmascript',
		comments: true,
		script: true,
		target: 'es2021',
		isModule: false
	}).body

	const statementsArray: Array<string> = []
	let commandBody: ExtractCommand = {
		parameters: [],
		cb: '',
		isAsync: false
	}

	console.log(body[0])
	const commands = { start: 0, end: 0 }

	const firstElement = body[0] as VariableDeclaration
	const secondElement = body[1] as ExpressionStatement

	if (firstElement.type === 'VariableDeclaration') {
		const castedToObjectPatternProperties = firstElement.declarations[0].id as ObjectPattern
		const properties = castedToObjectPatternProperties.properties

		const castedToObjectToExpression = firstElement.declarations[0].init as OptionalChainingCall
		const castedToObjectToExpressionToValue = castedToObjectToExpression.arguments[0].expression as StringLiteral
		const init = castedToObjectToExpressionToValue.value

		const propertiesArray: Array<string> = []
		if (properties && properties.length > 0) {
			properties.forEach((property: ObjectPatternProperty) => {
				const propertyKey = property as AssignmentPatternProperty
				propertiesArray.push(propertyKey.key.value)
			})
		}
		let importName = ''
		if (init && init.length > 0) {
			importName = init
		}
		if (importName) {
			statementsArray.push(`import { ${propertiesArray.join(',')} } from '${importName}'`)
		}
	}

	if (secondElement.type === 'ExpressionStatement') {
		const castedToAssignmentExpression = secondElement.expression as AssignmentExpression
		const castedToObjectExpression = castedToAssignmentExpression.right as ObjectExpression

		const data = castedToObjectExpression.properties.filter(
			(x: SpreadElement | Property) => x.type === 'KeyValueProperty'
		)[0] as KeyValueProperty

		const KeyValuePropertySpan = data.value as CallExpression

		commands.start = KeyValuePropertySpan.span.start - 1
		commands.end = KeyValuePropertySpan.span.end - 1

		const cbfunc = castedToObjectExpression.properties.filter(
			(x: SpreadElement | Property) => x.type === 'MethodProperty'
		)[0] as MethodProperty

		const paramaters = cbfunc.params.map((param: Param) => {
			const castedTypeObject = param.pat as BindingIdentifier
			if (isTypescript) {
				const castedTypeObjectToTsTypeReference = castedTypeObject.typeAnnotation?.typeAnnotation as TsTypeReference
				const castedTypeObjectToTypeKind = castedTypeObject.typeAnnotation?.typeAnnotation as TsKeywordType

				const typeObject = castedTypeObjectToTsTypeReference
				const castedTypeObjectTypeName = castedTypeObjectToTsTypeReference?.typeName as Identifier

				let typeName = ''
				if (typeObject && castedTypeObjectTypeName.value) {
					typeName = castedTypeObjectTypeName.value
				} else if (castedTypeObjectToTypeKind?.kind) {
					typeName = castedTypeObjectToTypeKind.kind
				} else {
					typeName = ''
				}

				return `${castedTypeObject.value}${typeName ? ':' + typeName : ''}`
			} else {
				return castedTypeObject.value
			}
		})

		const callBack = rawString.slice(cbfunc.body.span.start, cbfunc.body.span.end)

		/**
		 * To Pkmmte:
		 *
		 * The problem here is as defined :
		 * We need to imperatively slice the *"rawString" or we cannot keep the comments.
		 *
		 * And Offset for that is needed, but I'm not sure of the mathematical operations behind it.
		 * It's not incremanting linearly which makes it very hard to find the offset (perhaps you'll know the math for it.)
		 *
		 * Very IMPORTANT !!!!!!!
		 *
		 * Please know that in extractEventsAndIntents and we are also using the instance of SWC ! so that has to be token in count !
		 *
		 * It should normally be already, but keep that in mind while doing the math
		 *
		 * Once the offset is figured out, there'll be one thing left to do
		 *
		 * Removing the "," at the end of the callBack.
		 *
		 */

		commandBody = {
			parameters: paramaters,
			cb: callBack,
			isAsync: cbfunc.async
		}
	}
	offset = body[1].span.end

	const processCommand = await processCommands(
		rawString.slice(commands.start - offset - 1, commands.end - offset - 1),
		isTypescript
	)

	return {
		commandBody,
		statementsArray,
		commands: processCommand
	}
}

/**
 *
 * Processing the different options we could find in a command
 * If not everything is in there please let me know, but I think I took everything from the docs.
 */

function processOptions(
	fieldValue: string | number | boolean | choicesObjectType,
	fieldObject: string,
	commandOptions: CommandOptions,
	command: Subcommand | CommandAndSubcommands,
	commandObject: BodyExpressedInterface | NewExpression | CallExpression
) {
	if (typeof fieldValue === 'string') {
		if (fieldObject === 'setName') {
			commandOptions.optionName = fieldValue
		}
		if (fieldObject === 'setDescription') {
			commandOptions.description = fieldValue
		}
		if (fieldObject === 'setNameLocalizations') {
			commandOptions.localizationParameters.name = fieldValue
		}
		if (fieldObject === 'setDescriptionLocalizations') {
			commandOptions.localizationParameters.description = fieldValue
		}
		if (fieldObject === 'addUserOption') {
			commandOptions.optionType = fieldValue
		}

		if (fieldObject === 'addChannelTypes') {
			commandOptions.channelType = fieldValue
		}
	}

	if (typeof fieldValue === 'boolean') {
		if (fieldObject === 'setRequired') {
			commandOptions.isRequired = fieldValue
		}
	}

	if (typeof fieldValue === 'number') {
		if (fieldObject === 'setMaxLength') {
			commandOptions.maxLength = fieldValue
		}
	}

	if (fieldObject === 'addChoices') {
		let props = { name: '', value: '' }
		commandObject.arguments.forEach((choice: ExprOrSpread) => {
			const castAsObjExrp = choice.expression as ObjectExpression
			const castAsKVProperties = castAsObjExrp.properties as KeyValueProperty[]
			castAsKVProperties.forEach((prop: KeyValueProperty) => {
				const keyProp = prop.key as Identifier
				const keyValue = prop.value as StringLiteral
				if (keyProp.value === 'name') {
					props.name = keyValue.value
				}
				if (keyProp.value === 'value') {
					props.value = keyValue.value
				}
				if (props.name && props.value) {
					commandOptions.choices = [...commandOptions.choices, props]
					props = { name: '', value: '' }
				}
			})
		})
	}

	if (
		commandOptions.optionName !== '' &&
		command.options.filter((option: CommandOptions) => option.optionName === fieldValue).length <= 0
	) {
		command.options = [...command.options, commandOptions]
	}
}

async function extractEventsAndIntents(
	rawString: string,
	isTypescript: boolean
): Promise<{ intents: string; events: ExtractEvents[] }> {
	const body: Statement[] = parseSync(rawString, {
		syntax: isTypescript ? 'typescript' : 'ecmascript',
		comments: true,
		script: true,
		target: 'es2021',
		isModule: false
	}).body

	const events: ExtractEvents[] = []
	let intents = ''
	body.forEach((obj: Statement) => {
		if (obj.type === 'VariableDeclaration' && obj.kind === 'const') {
			const declarations = obj.declarations[0] as VariableDeclarator
			const declarationsCastedAsBindingIdentifier = declarations.id as BindingIdentifier
			const client =
				declarationsCastedAsBindingIdentifier.value === 'client' && obj.declarations[0].init.type === 'NewExpression'

			const init = declarations.init as CallExpression
			const initCastedAsObjectExpression = init.arguments[0].expression as ObjectExpression

			if (client) {
				const y = initCastedAsObjectExpression.span
				intents = rawString.slice(y.start - 1, y.end)
			}
		}

		const objCastesAsExpressionStatement = obj as ExpressionStatement
		const objExpression = objCastesAsExpressionStatement.expression as CallExpression

		if (objExpression?.arguments?.length > 0) {
			const objExpressionCalleeCastedAsMemberExpression = objExpression.callee as MemberExpression
			const objExpressionCastedAsIdentifier = objExpressionCalleeCastedAsMemberExpression.object as Identifier
			const objExpressionPropertyCastedAsIdentifier = objExpressionCalleeCastedAsMemberExpression.property as Identifier

			const isEvent =
				objExpressionCastedAsIdentifier.value === 'client' && objExpressionPropertyCastedAsIdentifier.value === 'on'
			if (isEvent) {
				const objExpressionFirstArgsCastedAsMe = objExpression?.arguments[0]?.expression as MemberExpression
				const objExpressionFirstArgsValueCastedAsIdentifier = objExpressionFirstArgsCastedAsMe.property as Identifier
				const objExpressionSecondArgsCastedAsFe = objExpression?.arguments[1]?.expression as FunctionExpression

				const body = objExpressionSecondArgsCastedAsFe.body
				const name = objExpressionFirstArgsValueCastedAsIdentifier?.value

				if (body) {
					const parameters = objExpressionSecondArgsCastedAsFe.params.map((param: Param): string => {
						const paramCastedAsIdentifier = param.pat as Identifier
						return paramCastedAsIdentifier?.value
					})
					const isAsync = objExpressionSecondArgsCastedAsFe.async
					let cb = ''
					if (body.type === 'BlockStatement') {
						cb = rawString.slice(body.span.start, body.span.end - 1)
					}
					if (name === 'InteractionCreate' && cb.indexOf('isChatInputCommand') !== -1 && cb.indexOf('execute') !== -1) {
						return
					}

					events.push({
						name: name.slice(0, 1).toLowerCase() + name.slice(1),
						cb: cb,
						isAsync: isAsync,
						parameters: parameters
					})
				}
			}
		}
	})

	offset = body[body.length - 1].span.end

	return {
		events: events,
		intents: intents
	}
}

/**
 * I will need a bigger objects to properly build that (half working)
 *
 */

async function buildImportStatement(intents: string): Promise<string> {
	const x = {
		partials: 'Partials',
		intents: 'GatewayIntentBits'
	}

	let s = ''

	if (intents.indexOf('Options.cacheWithLimits') !== -1) {
		s += 'Options, '
	}

	for (const [key, value] of Object.entries(x)) {
		if (intents.includes(key)) {
			s += value + ', '
		}
	}
	s = s.slice(0, -2)

	return `import { ${s} } from 'discord.js'`
}

async function convertCommandsfilesIntoRobo(isTypescript: boolean, exportPath: string) {
	const commandFolder = path.join(process.cwd(), 'commands')

	const walk = async (filePath: string): Promise<void> => {
		const cwd = await readdir(filePath, { withFileTypes: true })

		for (const file of cwd) {
			if (file.isDirectory()) {
				return walk(path.join(filePath, file.name))
			}

			try {
				const fileContent = await readFile(path.join(filePath, file.name), 'utf8')
				const { commandBody, statementsArray, commands } = await convertCommandToESM(fileContent, isTypescript)
				console.log('cmd bod', commandBody)
				await createCommandsFiles(commandBody, statementsArray, commands, exportPath, isTypescript)
			} catch (e) {
				console.log(e)
				exit(1)
			}
		}
	}

	await walk(commandFolder)
}

async function createCommandsFiles(
	commandBody: ExtractCommand,
	statementsArray: Array<string>,
	commands: CommandAndSubcommands,
	exportPath: string,
	isTypescript: boolean
) {
	const commandFolderPath = path.join(exportPath, 'src', 'commands')
	let fileContent = ''
	if (commands.subcommands.length > 0) {
		const subDir = await mkdir(path.join(commandFolderPath, commands.parentCommand), { recursive: true })
		if (!subDir) {
			subDir
		}
		const commandsPath = path.join(commandFolderPath, commands.parentCommand)
		for (let i = 0; i < commands.subcommands.length; ++i) {
			{
				const cmdObject = await generateCommandObject(commands.subcommands[i])
				fileContent = `
				${statementsArray}

				${cmdObject}
				
				export default ${commandBody.isAsync ? 'async' : ''} (${commandBody.parameters.join(',')}) =>
				${commandBody.cb}
				`

				await writeFile(
					path.join(commandsPath, `${commands.subcommands[i].subCommandName}.${isTypescript ? 'ts' : 'js'}`),
					fileContent
				)
				fileContent = ''
			}
		}
		return
	}

	const cmdObject = await generateCommandObject(commands)
	fileContent = `
	${statementsArray}

	${cmdObject}
	
	export default ${commandBody.isAsync ? 'async' : ''} (${commandBody.parameters.join(',')}) =>{
		${commandBody.cb}
	}`

	await writeFile(path.join(commandFolderPath, `${commands.parentCommand}.${isTypescript ? 'ts' : 'js'}`), fileContent)

	fileContent = ''
}

async function createEventFiles(events: ExtractEvents[], isTypescript: boolean, exportPath: string) {
	if (events.length > 0) {
		const eventDirPath = path.join(exportPath, 'src', 'events')
		events.forEach(async (event: ExtractEvents) => {
			try {
				const i = `export default ${event.isAsync ? 'async' : ''} (${event.parameters.join(',')}) =>{
					${event.cb}
				`
				await writeFile(path.join(eventDirPath, `${event.name}.${isTypescript ? 'ts' : 'js'}`), i)
			} catch (e) {
				console.log(e)
				exit(1)
			}
		})
	}
}

function isExtendedCallExpression(param: BodyExpressedInterface | MemberExpression): param is BodyExpressedInterface {
	return (param as CallExpression).callee !== undefined
}

function isSubcommand(param: CommandAndSubcommands | Subcommand): param is Subcommand {
	return (param as Subcommand).subCommandName !== undefined
}
