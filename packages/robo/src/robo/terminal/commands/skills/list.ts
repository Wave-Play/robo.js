/**
 * /skills list - List installed and available AI coding skills.
 */
import { createTerminalCommandConfig } from '../../../../core/cli-config-helpers.js'
import type { TerminalContext } from '../../../../types/cli.js'

export const config = createTerminalCommandConfig({
	description: 'List installed and available AI coding skills'
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const { getInstalledSkills, getSkillTargets, detectCodingTools, scanAllPluginSkills } = await import(
		'../../../../cli/utils/skills.js'
	)
	const path = await import('node:path')

	const installed = await getInstalledSkills()
	const allSkills = await scanAllPluginSkills()
	const targets = await getSkillTargets()

	ctx.write('\n')
	ctx.write('  AI Coding Skills\n')
	ctx.write('  ──────────────────\n')

	// Show active targets
	if (targets && targets.length > 0) {
		const cwd = process.cwd()
		const relativePaths = targets.map((t: string) => path.relative(cwd, t))
		ctx.write(`  Targets: ${relativePaths.join(', ')}\n`)
	} else {
		const { tools } = detectCodingTools()
		if (tools.length > 0) {
			ctx.write(`  Detected: ${tools.join(', ')}\n`)
		}
	}

	// Show installed skills
	const installedEntries = Object.entries(installed)

	if (installedEntries.length > 0) {
		ctx.write('\n  Installed:\n')

		for (const [name, record] of installedEntries) {
			const ver = record.pluginVersion ? `@${record.pluginVersion}` : ''
			ctx.write(`    ✔ ${name}  (from ${record.plugin}${ver})\n`)
		}
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
		ctx.write('\n  Available:\n')

		for (const skill of availableSkills) {
			const desc = skill.description ? ` — ${skill.description}` : ''
			ctx.write(`    - ${skill.name}${desc}\n`)
			ctx.write(`      from ${skill.plugin}\n`)
		}
	}

	if (installedEntries.length === 0 && availableSkills.length === 0) {
		ctx.write('\n  No skills found. Install a plugin that ships skills.\n')
	}

	ctx.write('\n')
}
