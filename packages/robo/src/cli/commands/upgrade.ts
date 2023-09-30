import fs from 'node:fs'
import { prepareFlashcore } from '../../core/flashcore.js'
import { color } from '../../core/color.js'
import { loadConfig } from '../../core/config.js'
import { logger } from '../../core/logger.js'
import { Command } from '../utils/cli-handler.js'
import { loadManifest } from '../utils/manifest.js'
import { checkUpdates } from './dev.js'
import { readFileSync } from 'node:fs'
import child_process from 'node:child_process'
import path from 'node:path'
import { createContext, Script } from 'node:vm'
import { cleanTempDir, cmd, exec, getPackageManager, packageJson } from '../utils/utils.js'
import type { Bindings } from '../../../codemod/types'

const command = new Command('upgrade')
	.description('Upgrades your Robo to the latest version')
	.option('-f', '--force', 'forcefully install')
	.option('-s', '--silent', 'do not print anything')
	.option('-v', '--verbose', 'print more information for debugging')
	.handler(upgradeAction)
export default command

interface UpgradeCommandOptions {
	force?: boolean
	silent?: boolean
	verbose?: boolean
}

// TODO:
// - Let user choose which changes to apply
// - Auto accept option for ci
// - Load changelog
// - Verify codemod hash
export async function upgradeAction(_files: string[], options: UpgradeCommandOptions) {
	// Create a logger
	logger({
		enabled: !options.silent,
		level: options.verbose ? 'debug' : 'info'
	}).info(`Checking for updates...`)
	logger.debug(`Current working directory:`, process.cwd())
	const startTime = Date.now()
	const config = await loadConfig()
	const manifest = await loadManifest()
	await prepareFlashcore()

	// Check NPM registry for updates
	const update = await checkUpdates(config, true, false)
	logger.debug(`Update payload:`, update)

	// Exit if there are no updates
	if (!update.hasUpdate) {
		logger.ready(`Your Robo is up to date! 🎉`)
		return
	}

	// Update with the same package manager
	const packageManager = getPackageManager()
	const command = packageManager === 'npm' ? 'install' : 'add'
	logger.debug(`Package manager:`, packageManager)

	await exec(`${cmd(packageManager)} ${command} ${packageJson.name}@${update.latestVersion}`)

	// Download codemod
	try {
		const codemodPath = path.join(process.cwd(), '.robo', 'temp', 'codemod-upgrade.js')
		fs.mkdirSync(path.dirname(codemodPath), { recursive: true })

		// Get repo URL
		const repoUrl = packageJson.repository.url.replace('.git', '')
		const repoUrlRaw = repoUrl.replace('github.com', 'raw.githubusercontent.com')
		const packageUrl = `${repoUrl}/tree/main/${packageJson.repository.directory}`
		const packageUrlRaw = `${repoUrlRaw}/main/${packageJson.repository.directory}`
		logger.debug(`Package URL:`, packageUrl)
		logger.debug(`Raw package URL:`, packageUrlRaw)

		// Download codemod
		const codemodUrl = `${packageUrlRaw}/codemod/upgrade.js`
		await Promise.all([downloadFile(codemodUrl, codemodPath)])

		// Read the codemod as plain text
		const codemodRaw = readFileSync(codemodPath, 'utf-8')
		logger.debug(`Successfully loaded codemod!`)

		// Run codemod
		const codemod = new Script(codemodRaw)
		const bindings: Bindings = {}
		const context = { bindings, child_process, color, console, cwd: process.cwd(), exec, fs, logger, path }
		
		createContext(context)
		codemod.runInContext(context)
		logger.debug(`Prepared codemod!`)

		// Check what needs to be changed
		const data = await context.bindings.check(update.latestVersion, config, manifest)

		// Execute all changes
		// TODO: Let user choose which changes to apply
		const changes = [...data.breaking, ...data.suggestions]
		await context.bindings.execute(changes, config, manifest)
	} finally {
		await cleanTempDir()
	}

	// Ta-dah!
	logger.debug(`Upgrade completed in ${Date.now() - startTime}ms`)
}

async function downloadFile(url: string, dest: string) {
	logger.debug(`Downloading file:`, url)
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}`)
	}

	const text = await response.text()
	const buffer = Buffer.from(text)
	return fs.promises.writeFile(dest, buffer)
}
