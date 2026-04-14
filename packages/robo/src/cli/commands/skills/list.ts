import { Highlight, HighlightGreen, Indent } from '../../../core/constants.js'
import { color } from '../../../core/color.js'
import { logger } from '../../../core/logger.js'
import { Command } from '../../utils/cli-handler.js'
import { detectCodingTools, getSkillTargets, scanAllPluginSkills, getInstalledSkills } from '../../utils/skills.js'
import path from 'node:path'
import type { CliContext } from '../../../types/cli.js'

interface ListOptions {
	silent?: boolean
	verbose?: boolean
}

const command = new Command('list')
	.description('List installed and available AI coding skills.')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.handler(listAction)
export default command

export async function listAction(context: CliContext) {
	const options = context.options as ListOptions
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	})

	const installed = await getInstalledSkills()
	const allSkills = await scanAllPluginSkills()
	const targets = await getSkillTargets()

	logger.log('')
	logger.log(Indent, color.bold('🧠 AI Coding Skills'))
	logger.log(Indent, '──────────────────')

	// Show active targets
	if (targets && targets.length > 0) {
		const cwd = process.cwd()
		const relativePaths = targets.map((t) => path.relative(cwd, t))
		logger.log(Indent, color.dim(`Targets: ${relativePaths.join(', ')}`))
	} else {
		const { tools } = detectCodingTools()
		if (tools.length > 0) {
			logger.log(Indent, color.dim(`Detected: ${tools.join(', ')}`))
		} else {
			logger.log(Indent, color.dim('No coding tools detected'))
		}
	}

	logger.log('')

	// Show installed skills
	const installedEntries = Object.entries(installed)

	if (installedEntries.length > 0) {
		logger.log(Indent, color.bold('Installed:'))

		for (const [name, record] of installedEntries) {
			const ver = record.pluginVersion ? `@${record.pluginVersion}` : ''
			logger.log(`${Indent}    ${HighlightGreen('✔ ' + name)}  ${color.dim('from ' + record.plugin + ver)}`)
		}

		logger.log('')
	}

	// Show available (not yet installed) skills
	const availableSkills: { name: string; description: string; plugin: string }[] = []

	for (const [plugin, skills] of allSkills) {
		for (const skill of skills) {
			if (!installed[skill.name]) {
				availableSkills.push({ name: skill.name, description: skill.description, plugin })
			}
		}
	}

	if (availableSkills.length > 0) {
		logger.log(Indent, color.bold('Available:'))

		for (const skill of availableSkills) {
			const desc = skill.description ? ' — ' + skill.description : ''
			logger.log(`${Indent}    - ${Highlight(skill.name)}${color.dim(desc)}`)
			logger.log(`${Indent}      ${color.dim('from ' + skill.plugin)}`)
		}

		logger.log('')
	}

	if (installedEntries.length === 0 && availableSkills.length === 0) {
		logger.log(Indent, color.dim('No skills found. Install a plugin that ships skills.'))
		logger.log('')
	}
}
