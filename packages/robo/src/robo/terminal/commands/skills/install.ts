/**
 * /skills install - Install AI coding skills from plugins.
 */
import { createTerminalCommandConfig } from '../../../../core/cli-config-helpers.js'
import type { TerminalContext } from '../../../../types/cli.js'

export const config = createTerminalCommandConfig({
	description: 'Install AI coding skills from plugins',
	options: [{ alias: '-a', name: '--all', description: 'Install from all plugins', type: 'boolean' }]
} as const)

export default async function (ctx: TerminalContext<typeof config>) {
	const { installSkills, getSkillTargets, detectCodingTools, scanAllPluginSkills, scanPluginSkills } = await import(
		'../../../../cli/utils/skills.js'
	)

	const args = ctx.args
	const installAll = ctx.options?.all
	const pluginArgs = args.filter((a: string) => !a.startsWith('-'))

	if (!installAll && pluginArgs.length === 0) {
		ctx.write('Usage: /skills install <plugin> or /skills install --all\n')
		return
	}

	// Resolve targets — in terminal context we can't prompt, so suggest CLI if no targets
	const targets = await getSkillTargets()
	if (targets === null || targets.length === 0) {
		const { tools } = detectCodingTools()
		if (tools.length === 0) {
			ctx.write('No coding tools detected. Run `robo skills install` from the CLI to select targets.\n')
			return
		}
	}

	const fs = await import('node:fs/promises')
	const path = await import('node:path')

	async function resolvePluginVersion(plugin: string): Promise<string | undefined> {
		try {
			const pkgJsonPath = path.join(process.cwd(), 'node_modules', plugin, 'package.json')
			const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'))
			return pkgJson.version
		} catch {
			return undefined
		}
	}

	if (installAll) {
		const allSkills = await scanAllPluginSkills()
		let totalInstalled = 0

		for (const [plugin, skills] of allSkills) {
			if (skills.length === 0) {
				continue
			}

			const pluginVersion = await resolvePluginVersion(plugin)
			const { installed } = await installSkills(skills, plugin, { pluginVersion, targets: targets ?? undefined })
			totalInstalled += installed.length

			for (const name of installed) {
				ctx.write(`  ✔ ${name} (from ${plugin})\n`)
			}
		}

		if (totalInstalled === 0) {
			ctx.write('No new skills to install.\n')
		} else {
			ctx.write(`\nInstalled ${totalInstalled} skill${totalInstalled > 1 ? 's' : ''}.\n`)
		}
	} else {
		for (const plugin of pluginArgs) {
			const skills = await scanPluginSkills(plugin)

			if (skills.length === 0) {
				ctx.write(`No skills found in ${plugin}.\n`)
				continue
			}

			const pluginVersion = await resolvePluginVersion(plugin)
			const { installed, skipped } = await installSkills(skills, plugin, { pluginVersion, targets: targets ?? undefined })

			for (const name of installed) {
				ctx.write(`  ✔ ${name}\n`)
			}

			for (const name of skipped) {
				ctx.write(`  - ${name} (already installed from another plugin)\n`)
			}
		}
	}
}
