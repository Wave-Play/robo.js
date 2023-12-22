import { promises as fs } from 'fs'
import path from 'node:path'
//import std from 'mock-stdin'
import { SpawnOptions, spawn } from 'node:child_process'
const FOLDER_PROJECTS_TEST_PATH = path.join(process.cwd(), '__tests__', 'projects')
const LOCAL_COPY_OF_ROBO_CREATE_PATH = path.join('..', '..', 'dist', 'index.js')
// Do not forget to install all required package managers !

// KNOWS ISSUES

// npx / npm exec : not finding Robo

// bunx : Not using bunx and somehow calls pnpm dlx

/* 
	The options chosen were:
	TypeScript
	ESLint, Prettier, API Plugin
	Skip
*/

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function areCredentialsSet(project_path: string): Promise<boolean> {
	const envCreds = await fs.readFile(project_path)
	const isCredentialsSet = envCreds.includes(`Credentials`)
	return isCredentialsSet
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// might wanna upgrade that to accept multiple args...
async function areFeaturesInstalled(features: string[], project_name: string): Promise<boolean> {
	const featuresInstalled: boolean[] = []

	for (const feature of features) {
		const feature_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, feature)
		await fs
			.access(feature_path)
			.then(() => featuresInstalled.push(true))
			.catch(() => false)
	}

	return featuresInstalled.filter((plugin) => plugin !== true).length <= 0 ? true : false
}

async function arePluginsInstalled(plugins: string[], project_name: string): Promise<boolean> {
	const pluginsInstalled: boolean[] = []

	for (const plugin of plugins) {
		const plugin_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, 'config', 'plugins', `${plugin}.mjs`)
		await fs
			.access(plugin_path)
			.then(() => pluginsInstalled.push(true))
			.catch(() => false)
	}

	return pluginsInstalled.filter((plugin) => plugin !== true).length <= 0 ? true : false
}

describe('Create Robos ', () => {
	beforeAll(async () => {
		await fs.rmdir(FOLDER_PROJECTS_TEST_PATH, { recursive: true })
		await fs.mkdir(FOLDER_PROJECTS_TEST_PATH)
	})

	// Common

	it('Plain Javascript: JavaScript, zero features, and credentials.', async () => {
		const project_name = `JZFC`
		await exec(`node ${LOCAL_COPY_OF_ROBO_CREATE_PATH} ${project_name} -js -f '' `, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`)
		const isCredentialsSet = await areCredentialsSet(env_file_path)
		expect(isCredentialsSet).toBeTruthy()
	}, 20000)

	it('Pain Typescript: TypeScript, zero features, and credentials.', async () => {
		const project_name = `TZFC`
		await exec(`node ${LOCAL_COPY_OF_ROBO_CREATE_PATH} ${project_name} -ts -f '' `, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`)
		const isCredentialsSet = await areCredentialsSet(env_file_path)
		expect(isCredentialsSet).toBeTruthy()
	}, 20000)

	it(`Standard JavaScript: JavaScript, recommended features, and credentials.`, async () => {
		const project_name = `JRFC`
		await exec(`node ${LOCAL_COPY_OF_ROBO_CREATE_PATH} ${project_name} -js -f prettier,eslint`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`)
		const isCredentialsSet = await areCredentialsSet(env_file_path)
		const featureInstalled = areFeaturesInstalled(['prettier.config.mjs', '.eslintrc.json'], project_name)

		if (featureInstalled) {
			expect(isCredentialsSet).toBeTruthy()
		}
	}, 20000)

	it(`Standard TypeScript: TypeScript, recommended features, and credentials.`, async () => {
		const project_name = `TRFC`
		await exec(`node ${LOCAL_COPY_OF_ROBO_CREATE_PATH} ${project_name} -ts -f prettier,eslint`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`)

		const isCredentialsSet = await areCredentialsSet(env_file_path)
		const featureInstalled = areFeaturesInstalled(['prettier.config.mjs', '.eslintrc.json'], project_name)

		if (featureInstalled) {
			expect(isCredentialsSet).toBeTruthy()
		}
	}, 20000)

	it(`Skipped Credentials JS: JavaScript, recommended features, skip credentials.`, async () => {
		const project_name = `JRFSC`
		await exec(`node ${LOCAL_COPY_OF_ROBO_CREATE_PATH} ${project_name} -js -f prettier,eslint`, false, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`)

		const isCredentialsSet = await areCredentialsSet(env_file_path)
		const featureInstalled = areFeaturesInstalled(['prettier.config.mjs', '.eslintrc.json'], project_name)

		if (featureInstalled) {
			expect(isCredentialsSet).toBeFalsy()
		}
	}, 20000)

	it(`Skipped Credentials TS: TypeScript, recommended features, skip credentials.`, async () => {
		const project_name = `TRFSC`
		await exec(`node ${LOCAL_COPY_OF_ROBO_CREATE_PATH} ${project_name} -ts -f prettier,eslint`, false, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`)

		const isCredentialsSet = await areCredentialsSet(env_file_path)
		const featureInstalled = areFeaturesInstalled(['prettier.config.mjs', '.eslintrc.json'], project_name)

		if (featureInstalled) {
			expect(isCredentialsSet).toBeFalsy()
		}
	}, 20000)

	it(`Standard JS Plugin: Same as Standard JS but as a plugin.`, async () => {
		const project_name = 'JSTANDARP'
		await exec(`node ${LOCAL_COPY_OF_ROBO_CREATE_PATH} ${project_name} -js --plugin -f prettier,eslint`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})

		const md_file_path = fs
			.access(path.join(FOLDER_PROJECTS_TEST_PATH, project_name, 'DEVELOPMENT.md'))
			.then(() => true)
			.catch(() => false)
		const isPlugin = (
			await fs.readFile(path.join(FOLDER_PROJECTS_TEST_PATH, project_name, 'config', 'robo.mjs'))
		).includes("type: 'plugin'")
		const featureInstalled = areFeaturesInstalled(['prettier.config.mjs', '.eslintrc.json'], project_name)

		if (md_file_path && featureInstalled) {
			expect(isPlugin).toBeTruthy()
		}
	}, 20000)

	it(`Standard TS Plugin: Same as Standard TS but as a plugin.`, async () => {
		const project_name = 'TSTANDARDP'
		await exec(
			`node ${LOCAL_COPY_OF_ROBO_CREATE_PATH} ${project_name}  -rv 0.9.9 -ts --plugin -f prettier,eslint`,
			true,
			{
				cwd: FOLDER_PROJECTS_TEST_PATH
			}
		)

		const md_file_path = fs
			.access(path.join(FOLDER_PROJECTS_TEST_PATH, project_name, 'DEVELOPMENT.md'))
			.then(() => true)
			.catch(() => false)
		const isPlugin = (
			await fs.readFile(path.join(FOLDER_PROJECTS_TEST_PATH, project_name, 'config', 'robo.mjs'))
		).includes("type: 'plugin'")
		const featureInstalled = areFeaturesInstalled(['prettier.config.mjs', '.eslintrc.json'], project_name)

		if (md_file_path && featureInstalled) {
			expect(isPlugin).toBeTruthy()
		}
	}, 20000)

	// Package Managers

	it(`Standard TypeScript But PNPX: TypeScript, recommended features, and credentials.`, async () => {
		const project_name = 'TRFC'
		await exec(`pnpx ${LOCAL_COPY_OF_ROBO_CREATE_PATH} ${project_name} -ts -f prettier,eslint`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`)

		const isCredentialsSet = await areCredentialsSet(env_file_path)
		const featureInstalled = areFeaturesInstalled(['prettier.config.mjs', '.eslintrc.json'], project_name)

		if (featureInstalled) {
			expect(isCredentialsSet).toBeTruthy()
		}
	}, 20000)

	// yarn being different we gotta use "robo" and not "create-robo".

	it(`Standard TypeScript But Yarn create: TypeScript, recommended features, and credentials.`, async () => {
		const project_name = 'YTRFC'
		await exec(`yarn create ${LOCAL_COPY_OF_ROBO_CREATE_PATH}  ${project_name} -ts -f prettier,eslint`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`)

		const isCredentialsSet = await areCredentialsSet(env_file_path)
		const featureInstalled = areFeaturesInstalled(['prettier.config.mjs', '.eslintrc.json'], project_name)

		if (featureInstalled) {
			expect(isCredentialsSet).toBeTruthy()
		}
	}, 20000)

	// Bun X

	it(`Standard TypeScript But BUNX: TypeScript, recommended features, and credentials.`, async () => {
		const project_name = 'BXTRFC'
		await exec(`bunx ${LOCAL_COPY_OF_ROBO_CREATE_PATH}  ${project_name} -ts -f prettier,eslint`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`)

		const isCredentialsSet = await areCredentialsSet(env_file_path)
		const featureInstalled = areFeaturesInstalled(['prettier.config.mjs', '.eslintrc.json'], project_name)

		if (featureInstalled) {
			expect(isCredentialsSet).toBeTruthy()
		}
	}, 20000)

	// Specials !

	it(`Plugins: Same as Standard TS but with the api and ai plugins installed.`, async () => {
		const project_name = 'STWAPIAI'
		await exec(
			`node ${LOCAL_COPY_OF_ROBO_CREATE_PATH} ${project_name} -rv 0.9.9 -ts -f prettier,eslint --plugins @roboplay/plugin-ai @roboplay/plugin-api`,
			true,
			{
				cwd: FOLDER_PROJECTS_TEST_PATH
			}
		)

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`)
		const isCredentialsSet = await areCredentialsSet(env_file_path)

		const featureInstalled = areFeaturesInstalled(['prettier.config.mjs', '.eslintrc.json'], project_name)
		const pluginsInstalled = await arePluginsInstalled(['plugin-ai', 'plugin-api'], project_name)

		if (featureInstalled && isCredentialsSet) {
			expect(pluginsInstalled).toBeTruthy()
		}
	}, 20000)

	it(`Robo Version: Same as Standard TS but using a specific version of Robo.js.`, async () => {
		const project_name = 'STWV'
		const rv = '0.9.0'
		await exec(`node ${LOCAL_COPY_OF_ROBO_CREATE_PATH} ${project_name}  -ts -rv ${rv} -f prettier,eslint`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`)
		const isCredentialsSet = await areCredentialsSet(env_file_path)

		const roboVersion = JSON.parse(
			await fs.readFile(path.join(FOLDER_PROJECTS_TEST_PATH, project_name, 'package.json'), 'utf-8')
		)['dependencies']['@roboplay/robo.js']
		const featuresInstalled = await areFeaturesInstalled(['prettier.config.mjs', '.eslintrc.json'], project_name)

		if (featuresInstalled && isCredentialsSet) {
			expect(roboVersion).toBe(rv)
		}
	}, 20000)

	it(`No Install: Same as Standard TS minus the installation of dependencies.`, async () => {
		const project_name = 'STMI'
		await exec(`bunx create-robo ${project_name} -ts -f -ni prettier,eslint`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`)

		const isCredentialsSet = await areCredentialsSet(env_file_path)
		const featureInstalled = areFeaturesInstalled(['prettier.config.mjs', '.eslintrc.json'], project_name)
		const dependencies = JSON.parse(
			await fs.readFile(path.join(FOLDER_PROJECTS_TEST_PATH, project_name, 'package.json'), 'utf-8')
		)['dependencies']

		if (featureInstalled && Object.keys(dependencies).length <= 0) {
			expect(isCredentialsSet).toBeTruthy()
		}
	}, 20000)
})

/*const IS_WINDOWS = /^win/.test(process.platform)

function cmd(packageManager: string): string {
	return IS_WINDOWS ? `${packageManager}.cmd` : packageManager
}*/

function exec(command: string, passCreds: boolean, options?: SpawnOptions) {
	return new Promise<void>((resolve, reject) => {
		// Run command as child process
		const args = command.split(' ')
		const childProcess = spawn(args.shift(), args, {
			...(options ?? {}),
			env: { ...process.env, FORCE_COLOR: '1' },
			stdio: 'pipe'
		})

		childProcess.stdout.on('data', (data: any) => {
			const convertString = String.fromCharCode(...data)

			if (convertString.includes('Client ID')) {
				passCreds ? childProcess.stdin.write(`Credentials\n`) : childProcess.stdin.write(`\n`)
			}
		})

		childProcess.stderr.on('data', function (data) {
			console.log('stdout: ' + data)
		})

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
			console.log(error)
			reject(error)
		})
	})
}
