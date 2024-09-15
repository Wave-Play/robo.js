import { Command } from '../utils/cli-handler.js'
import { logger } from '../../core/logger.js'
import { color } from '../../core/color.js'
import { Compiler } from '../utils/compiler.js'

const command = new Command('why')
	.description(
		'Find out why a command, event, permission, or scope is in your Robo. e.g. /ping, @ready, %ADMINISTRATOR, +applications.commands'
	)
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.option('-h', '--help', 'Shows the available command options')
	.handler(whyAction)
export default command

const validPrefixes = [
	{ symbol: '/', full: 'command:', symbolMinLength: 2, fullMinLength: 9 },
	{ symbol: '@', full: 'event:', symbolMinLength: 2, fullMinLength: 7 },
	{ symbol: '%', full: 'permission:', symbolMinLength: 2, fullMinLength: 12 },
	{ symbol: '+', full: 'scope:', symbolMinLength: 2, fullMinLength: 7 }
]

interface WhyCommandOptions {
	silent?: boolean
	verbose?: boolean
}

async function whyAction(args: string[], options: WhyCommandOptions) {
	const text = args[0]

	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	})
	logger.debug(`> "${text}"`)

	if (!text) {
		logger.error('Please provide a command, event, permission, or scope.')
		process.exit(1)
	}

	let prefixType = null
	for (const prefix of validPrefixes) {
		if (text.startsWith(prefix.symbol) || text.startsWith(prefix.full)) {
			if (
				(text.startsWith(prefix.symbol) && text.length >= prefix.symbolMinLength) ||
				(text.startsWith(prefix.full) && text.length >= prefix.fullMinLength)
			) {
				prefixType = prefix
				break
			} else {
				logger.error(`Please provide a ${prefix.full.slice(0, -1)} name.`)
				process.exit(1)
			}
		}
	}

	if (!prefixType) {
		logger.error('Please provide a command, event, permission, or scope.')
		process.exit(1)
	}

	// Remove full or symbol prefix from text
	const entity = text.startsWith(prefixType.full)
		? text.slice(prefixType.full.length)
		: text.slice(prefixType.symbol.length)
	logger.debug(`Searching for ${prefixType.full.replace(':', '')} ${color.blue(entity)}...`)

	// Look for the entity in the manifest
	const manifest = await Compiler.useManifest()
	logger.debug(`Manifest: ${JSON.stringify(manifest, null, 2)}`)

	if (prefixType.full === 'command:') {
		const command = manifest.commands[entity]
		if (!command) {
			logger.info('This command does not exist.')
		} else if (command.__plugin) {
			logger.info(`This command is provided by the ${color.blue(command.__plugin.name)} plugin.`)
		} else if (command.__auto) {
			logger.info(
				'This is a default command. You can override it by creating a command with the same name or disable it in your config file.'
			)
		} else {
			logger.info(
				`This command exists in your Robo because you created it: ${color.blue('/src/commands/' + command.__path)}`
			)
		}
	} else if (prefixType.full === 'event:') {
		const event = manifest.events[entity]
		if (!event) {
			logger.info('This event does not exist.')
			return
		}

		// Log info for all events
		const events = Array.isArray(event) ? event : [event]
		const plugins = []
		const defaults = []
		const custom = []
		const files: string[] = []
		for (const event of events) {
			if (event.__plugin) {
				plugins.push(event)
				files.push(event.__plugin.name + ' (' + event.__path + ')')
			} else if (event.__auto) {
				defaults.push(event)
				files.push('default ' + event.__path)
			} else {
				custom.push(event)
				files.push('/src/events/' + event.__path)
			}
		}
		logger.info(`This event is being handled by the following:\n`)
		if (plugins.length) {
			logger.log('        ' + color.bold(`Plugins`))
			plugins.forEach((e) => {
				logger.log(`        ${color.blue(e.__plugin.name) + ':'}`, e.__path)
			})
			logger.log('')
		}
		if (defaults.length) {
			logger.log('        ' + color.bold(`Default config`))
			defaults.forEach((e) => {
				logger.log(`        ${color.blue('Δ')}`, e.__path)
			})
			logger.log('')
		}
		if (custom.length) {
			logger.log('        ' + color.bold(`Files`))
			custom.forEach((e) => {
				logger.log(`        ${color.blue('/src/events/' + e.__path)}`)
			})
			logger.log('')
		}
	} else if (prefixType.full === 'permission:') {
		// TODO:
	} else if (prefixType.full === 'scope:') {
		// TODO:
	} else {
		// @ts-expect-error - This is fine
		const entityData = manifest[prefixType.full.slice(0, -1)]?.[entity]
		logger.debug(`Entity data:`, entityData)
		if (!entityData) {
			logger.error(`Could not find ${prefixType.full.replace(':', '')} ${color.blue(entity)}.`)
			process.exit(1)
		}
	}
}
