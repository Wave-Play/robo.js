import { promises as fs } from 'fs'
import path from 'node:path'
import std from 'mock-stdin'
import { SpawnOptions, spawn } from 'node:child_process'
const FOLDER_PROJECTS_TEST_PATH = path.join(process.cwd(), '__tests__', 'projects')

describe('Create Robos ', () => {
	beforeAll(async () => {
		await fs.rmdir(FOLDER_PROJECTS_TEST_PATH)
		await fs.mkdir(FOLDER_PROJECTS_TEST_PATH)
	})

	it('Plain Javascript: JavaScript, zero features, and credentials', async () => {
		await exec(`npm.cmd exec create-robo JZFC -js`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})
	}, 500000)
})

/**
 * childProcess.stdout.on('data', (data: any) => {
			const convertString = String.fromCharCode(...data)

			if (convertString.includes('client') || convertString.includes('token')) {
				std.stdin().send('Credentials')
			}
		})
*/
/*const IS_WINDOWS = /^win/.test(process.platform)

function cmd(packageManager: string): string {
	return IS_WINDOWS ? `${packageManager}.cmd` : packageManager
}*/

/**
 *  Plain Javascript: JavaScript, zero features, and credentials.
	Plain TypeScript: TypeScript, zero features, and credentials.
	Standard JavaScript: JavaScript, recommended features, and credentials.
	Standard TypeScript: TypeScript, recommended features, and credentials.
	Skipped Credentials JS: JavaScript, recommended features, and skip credentials.
	Skipped Credentials TS: TypeScript, recommended features, and skip credentials.
	Standard JS Plugin: Same as Standard JS but as a plugin.
	Standard TS Plugin: Same as Standard TS but as a plugin.
 */

/*import path from 'node:path'
import { loadConfig, getConfig } from '../src/core/config.js'
// @ts-expect-error - mock
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { logger } from '../src/core/logger.js'

const tempConfigDir = path.join(__dirname, '..', 'config')
const tempConfigFile = path.join(tempConfigDir, 'robo.json')

beforeEach(async () => {
	await fs.mkdir(tempConfigDir, { recursive: true })
})

afterEach(async () => {
	try {
		await fs.unlink(tempConfigFile)
	} catch (error) {
		// If the file doesn't exist, do nothing
	}
})

describe('Config Loader', () => {
	it('should return null when no config has been loaded', async () => {
		expect(getConfig()).toBeNull()
	})

	it('should correctly load a .json config file', async () => {
		await fs.writeFile(tempConfigFile, '{"clientOptions": {"intents": ["GREETINGS"]}}')

		const config = await loadConfig('robo')
		expect(config).toEqual({
			clientOptions: {
				intents: ['GREETINGS']
			},
			plugins: []
		})
	})

	it('should return a default configuration when no config file exists', async () => {
		const config = await loadConfig('robo')
		expect(config).toEqual({
			clientOptions: {
				intents: []
			}
		})
	})
})*/

function exec(command: string, passCreds: boolean, options?: SpawnOptions) {
	return new Promise<void>((resolve, reject) => {
		// Run command as child process
		const args = command.split(' ')
		const childProcess = spawn(args.shift(), args, {
			...(options ?? {}),
			env: { ...process.env, FORCE_COLOR: '1' },
			stdio: 'pipe'
		})

		if (passCreds) {
			childProcess.stdout.on('data', (data: any) => {
				const convertString = String.fromCharCode(...data)

				if (convertString.includes('client') || convertString.includes('token')) {
					std.stdin().send('Credentials')
				}
			})
		}

		// Resolve promise when child process exits
		childProcess.on('close', (code) => {
			if (code === 0) {
				resolve()
			} else {
				reject(new Error(`Child process exited with code ${code}`))
			}
		})

		// Or reject when it errors
		childProcess.on('error', (error) => {
			reject(error)
		})
	})
}
