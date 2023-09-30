import type { Config } from '../src/types/config'
import type { Manifest } from '../src/types/manifest'
import type { Change, CheckResult } from './types'

let _id = 0

const loggy = logger.fork(color.cyan('codemod') + ' -')

const CHANGES: Record<string, Change> = {
	configDirectory: {
		id: ++_id,
		name: 'Config directory',
		description: 'The config directory has been renamed from `.config` to `config`.'
	}
}

/**
 * Checks for any changes between current and target version.
 *
 * This is to be called after the upgrade has been installed, but before
 * executing this upgrade script. This is to ensure that the user is able
 * to select which changes they want to apply and why.
 *
 * @param version The target version being upgraded to
 * @param config The current Robo config
 * @param manifest The current Robo manifest
 */
bindings.check = async function (version: string, _config: Config, _manifest: Manifest): Promise<CheckResult> {
	loggy.info(`Checking version ${version}...`)
	const breaking: Change[] = []
	const suggestions: Change[] = []

	// Check for breaking changes
	if (fs.existsSync(path.join(cwd, '.config'))) {
		breaking.push(CHANGES.configDirectory)
	}

	return { breaking, suggestions }
}

/**
 * Executes the changes selected by the user.
 * 
 * @param changes The changes selected by the user
 * @param config The current Robo config
 * @param manifest The current Robo manifest
 */
bindings.execute = async function (changes: Change[], _config: Config, _manifest: Manifest) {
	loggy.info(`Applying changes:`, changes.map((change) => change.name).join(', '))

	for (const change of changes) {
		if (change.id === CHANGES.configDirectory.id) {
			loggy.debug(`Renaming config directory...`)
			fs.renameSync(path.join(cwd, '.config'), path.join(cwd, 'config'))
		}
	}

	loggy.info(`Successfully applied changes!`)
}
