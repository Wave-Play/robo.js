import { Highlight, HighlightGreen, Indent } from '../../../core/constants.js'
import { color } from '../../../core/color.js'
import { logger } from '../../../core/logger.js'
import { Command } from '../../utils/cli-handler.js'
import {
	getInstalledSkills,
	installSkills,
	removeSkillsByPlugin,
	scanPluginSkills
} from '../../utils/skills.js'
import { createRequire } from 'node:module'
import type { CliContext } from '../../../types/cli.js'

const require = createRequire(import.meta.url)

interface UpdateOptions {
	silent?: boolean
	verbose?: boolean
}

const command = new Command('update')
	.description('Update installed AI coding skills from their source plugins.')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.positionalArgs(true)
	.handler(updateAction)
export default command

async function updateAction(context: CliContext) {
	const options = context.options as UpdateOptions
	const plugins = context.args
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	})

	const installed = await getInstalledSkills()

	// Determine which plugins to update
	let targetPlugins: string[]

	if (plugins.length > 0) {
		targetPlugins = plugins
	} else {
		// Update all installed — collect unique plugin names
		targetPlugins = [...new Set(Object.values(installed).map((r) => r.plugin))]
	}

	if (targetPlugins.length === 0) {
		logger.log('')
		logger.log(Indent, color.dim('No installed skills to update.'))
		logger.log('')
		return
	}

	logger.log('')
	let totalUpdated = 0

	for (const plugin of targetPlugins) {
		const skills = await scanPluginSkills(plugin)

		if (skills.length === 0) {
			logger.log(Indent, color.dim(`No skills found in ${plugin} source.`))
			continue
		}

		// Resolve plugin version for manifest tracking
		let pluginVersion: string | undefined
		try {
			const pkgJson = require(`${plugin}/package.json`)
			pluginVersion = pkgJson.version
		} catch {
			/* ignore */
		}

		// Remove existing skills from this plugin, then reinstall
		await removeSkillsByPlugin(plugin)
		const { installed: updated } = await installSkills(skills, plugin, { force: true, pluginVersion })
		totalUpdated += updated.length

		logger.log(Indent, `📦 ${Highlight(plugin)}`)

		for (const name of updated) {
			logger.log(`${Indent}    ${HighlightGreen('✔ ' + name)}`)
		}
	}

	logger.log('')

	if (totalUpdated > 0) {
		logger.log(Indent, `✨ Updated ${totalUpdated} skill${totalUpdated > 1 ? 's' : ''}.\n`)
	} else {
		logger.log(Indent, color.dim('No skills were updated.'))
		logger.log('')
	}
}
