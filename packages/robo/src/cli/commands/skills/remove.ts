import { HighlightGreen, Indent } from '../../../core/constants.js'
import { color } from '../../../core/color.js'
import { logger } from '../../../core/logger.js'
import { Command } from '../../utils/cli-handler.js'
import { removeSkillsByPlugin } from '../../utils/skills.js'
import type { CliContext } from '../../../types/cli.js'

interface RemoveOptions {
	silent?: boolean
	verbose?: boolean
}

const command = new Command('remove')
	.description('Remove AI coding skills installed from a plugin.')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.positionalArgs(true)
	.handler(removeAction)
export default command

async function removeAction(context: CliContext) {
	const options = context.options as RemoveOptions
	const plugins = context.args
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	})

	if (plugins.length === 0) {
		logger.error(`Specify a plugin name. Usage: ${color.bold('robo skills remove <plugin>')}`)
		return
	}

	logger.log('')

	for (const plugin of plugins) {
		const removed = await removeSkillsByPlugin(plugin)

		if (removed.length === 0) {
			logger.log(Indent, color.dim(`No skills installed from ${plugin}.`))
		} else {
			for (const name of removed) {
				logger.log(`${Indent}    ${HighlightGreen('✔ Removed ' + name)}`)
			}
		}
	}

	logger.log('')
}
