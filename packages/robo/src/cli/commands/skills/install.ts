import { Highlight, HighlightGreen, Indent } from '../../../core/constants.js'
import { color } from '../../../core/color.js'
import { logger } from '../../../core/logger.js'
import { Command } from '../../utils/cli-handler.js'
import {
	detectCodingTools,
	getSkillTargets,
	installSkills,
	promptForCodingTools,
	saveTargets,
	scanAllPluginSkills,
	scanPluginSkills
} from '../../utils/skills.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import type { CliContext } from '../../../types/cli.js'

interface InstallOptions {
	all?: boolean
	force?: boolean
	silent?: boolean
	verbose?: boolean
	yes?: boolean
}

const command = new Command('install')
	.description('Install AI coding skills from plugins.')
	.option('-a', '--all', 'install skills from all registered plugins')
	.option('-f', '--force', 'overwrite existing skills from other plugins')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.option('-y', '--yes', 'auto-accept installation')
	.positionalArgs(true)
	.handler(installAction)
export default command

async function installAction(context: CliContext) {
	const options = context.options as InstallOptions
	const plugins = context.args
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	})

	if (!options.all && plugins.length === 0) {
		logger.error(`Specify a plugin name or use ${color.bold('--all')} to install from all plugins.`)
		return
	}

	// Resolve targets — auto-detect or prompt
	let targets = await getSkillTargets()
	if (targets === null) {
		const dirs = await promptForCodingTools()
		targets = dirs.map((d) => path.join(process.cwd(), d))
		await saveTargets(targets)
	}

	if (targets.length === 0) {
		logger.log('')
		logger.log(Indent, color.dim('No skill targets configured. Set ROBO_SKILL_TARGETS or run from a project with a coding tool.'))
		logger.log('')
		return
	}

	const { tools } = detectCodingTools()
	if (tools.length > 0) {
		logger.log('')
		logger.log(Indent, color.dim(`Detected: ${tools.join(', ')}`))
	}

	logger.log('')

	if (options.all) {
		// Install from all registered plugins
		const allSkills = await scanAllPluginSkills()
		let totalInstalled = 0

		for (const [plugin, skills] of allSkills) {
			if (skills.length === 0) {
				continue
			}

			logger.log(Indent, `📦 ${Highlight(plugin)}`)

			for (const skill of skills) {
				const desc = skill.description ? ' — ' + skill.description : ''
				logger.log(`${Indent}    - ${skill.name}${color.dim(desc)}`)
			}

			if (!options.yes) {
				await logger.flush()
				const response = await prompt(Indent + `    Install these skills? ${color.dim('[Y/n]')}: `)

				const answer = response.toLowerCase().trim()

				if (answer !== 'y' && answer !== '') {
					logger.log(Indent, color.dim('Skipped.'))
					logger.log('')
					continue
				}
			}

			const pluginVersion = await resolvePluginVersion(plugin)
			const { installed, skipped } = await installSkills(skills, plugin, { force: options.force, pluginVersion, targets })
			totalInstalled += installed.length

			for (const name of installed) {
				logger.log(`${Indent}    ${HighlightGreen('✔ ' + name)}`)
			}

			for (const name of skipped) {
				logger.log(`${Indent}    ${color.dim('- ' + name + ' (already installed from another plugin)')}`)
			}

			logger.log('')
		}

		if (totalInstalled === 0) {
			logger.log(Indent, color.dim('No new skills to install.'))
		} else {
			logger.log(Indent, `✨ Installed ${totalInstalled} skill${totalInstalled > 1 ? 's' : ''}.\n`)
		}
	} else {
		// Install from specific plugins
		for (const plugin of plugins) {
			const skills = await scanPluginSkills(plugin)

			if (skills.length === 0) {
				logger.log(Indent, color.dim(`No skills found in ${plugin}.`))
				logger.log('')
				continue
			}

			logger.log(Indent, `📦 ${Highlight(plugin)}`)

			for (const skill of skills) {
				const desc = skill.description ? ' — ' + skill.description : ''
				logger.log(`${Indent}    - ${skill.name}${color.dim(desc)}`)
			}

			if (!options.yes) {
				await logger.flush()
				const response = await prompt(Indent + `    Install these skills? ${color.dim('[Y/n]')}: `)

				const answer = response.toLowerCase().trim()

				if (answer !== 'y' && answer !== '') {
					logger.log(Indent, color.dim('Skipped.'))
					logger.log('')
					continue
				}
			}

			const pluginVersion = await resolvePluginVersion(plugin)
			const { installed, skipped } = await installSkills(skills, plugin, { force: options.force, pluginVersion, targets })

			for (const name of installed) {
				logger.log(`${Indent}    ${HighlightGreen('✔ ' + name)}`)
			}

			for (const name of skipped) {
				logger.log(`${Indent}    ${color.dim('- ' + name + ' (already installed from another plugin)')}`)
			}

			logger.log('')
		}
	}
}

async function resolvePluginVersion(plugin: string): Promise<string | undefined> {
	try {
		const pkgJsonPath = path.join(process.cwd(), 'node_modules', plugin, 'package.json')
		const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'))
		return pkgJson.version
	} catch {
		return undefined
	}
}

function prompt(question: string): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	})

	return new Promise((resolve) => {
		rl.question(question, (input) => {
			rl.close()
			resolve(input)
		})
	})
}
