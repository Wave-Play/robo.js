import { promises as fs } from 'fs'
import path from 'node:path'
//import std from 'mock-stdin'
import { SpawnOptions, spawn } from 'node:child_process'
const FOLDER_PROJECTS_TEST_PATH = path.join(process.cwd(), '__tests__', 'projects')

// Do not forget to install all required package managers !

// KNOWS ISSUES

// npx / npm exec : not finding Robo

// bunx : Not using bunx and somehow calls pnpm dlx

// when executing the tests for --plugin, it's not generating a .env file.

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
/*async function areCredentialsSet(project_path: string): Promise<boolean>{
	const envCreds = await fs.readFile(project_path);
	const isCredentialsSet = envCreds.includes(`Credentials`);
	return isCredentialsSet;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// might wanna upgrade that to accept multiple args...
async function areFeaturesSet(prettier_path: string): Promise<boolean>{
	const isPrettier = await fs.access(prettier_path).then(() => true).catch(() => false);
	return isPrettier;

}*/

describe('Create Robos ', () => {
	beforeAll(async () => {
		await fs.rmdir(FOLDER_PROJECTS_TEST_PATH, { recursive: true })
		await fs.mkdir(FOLDER_PROJECTS_TEST_PATH)
	})

	// Common

	/*it('Plain Javascript: JavaScript, zero features, and credentials.', async () => {
		const project_name = `JZFC`;
		await exec(`pnpx create-robo ${project_name} -js -f '' `, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		});
		
		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`);
		const isCredentialsSet = await areCredentialsSet(env_file_path);
		expect(isCredentialsSet).toBeTruthy();
		
	}, 20000)

	it('Pain Typescript: TypeScript, zero features, and credentials.', async () => {
		const project_name = `TZFC`;
		await exec(`pnpx create-robo ${project_name} -ts -f '' `, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		});

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`);
		const isCredentialsSet = await areCredentialsSet(env_file_path);
		expect(isCredentialsSet).toBeTruthy();

	}, 20000)


	it(`Standard JavaScript: JavaScript, recommended features, and credentials.`, async () => {
		const project_name = `JRFC`;
		await exec(`pnpx create-robo ${project_name} -js -f prettier, eslint`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`);
		const prettier_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `prettier.config.mjs`);

		const isCredentialsSet = await areCredentialsSet(env_file_path);
		const isPrettier = await areFeaturesSet(prettier_file_path);

	
		if(isPrettier){
			expect(isCredentialsSet).toBeTruthy();
		}


	}, 20000)

	it(`Standard TypeScript: TypeScript, recommended features, and credentials.`, async () => {
		const project_name = `TRFC`
		await exec(`pnpx create-robo ${project_name} -ts -f prettier, eslint`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})


		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`);
		const prettier_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `prettier.config.mjs`);

		const isCredentialsSet = await areCredentialsSet(env_file_path);
		const isPrettier = await areFeaturesSet(prettier_file_path);

		if(isPrettier){
			expect(isCredentialsSet).toBeTruthy();
		}
	}, 20000)

	it(`Skipped Credentials JS: JavaScript, recommended features, skip credentials.`, async () => {
		const project_name = `JRFSC`;
		await exec(`pnpx create-robo ${project_name} -js -f prettier, eslint`, false, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`);
		const prettier_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `prettier.config.mjs`);

		const isCredentialsSet = await areCredentialsSet(env_file_path);
		const isPrettier = await areFeaturesSet(prettier_file_path)

		if(isPrettier) {
			expect(isCredentialsSet).toBeFalsy();
		}

	}, 20000)

	it(`Skipped Credentials TS: TypeScript, recommended features, skip credentials.`, async () => {
		const project_name = `TRFSC`;
		await exec(`pnpx create-robo ${project_name} -ts -f prettier, eslint`, false, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `.env`);
		const prettier_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `prettier.config.mjs`);

		const isCredentialsSet = await areCredentialsSet(env_file_path);
		const isPrettier = await areFeaturesSet(prettier_file_path)

		if(isPrettier) {
			expect(isCredentialsSet).toBeFalsy();
		} 

	}, 20000)*/

	/*it(`Plugins: Same as Standard TS but with the api and ai plugins installed.`, async () => {
		await exec(`bun x create-robo STWAPIAI -rv 0.9.5 -ts -f prettier, eslint -p @roboplay/plugin-ai @roboplay/plugin-api`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})
	}, 20000);*/

	/*it(`Plugins: Same as Standard TS but with the api and ai plugins installed.`, async () => {
		await exec(`bun x create-robo SJWAPIAI -rv 0.9.5 -js -f prettier, eslint -p @roboplay/plugin-ai @roboplay/plugin-api`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})
	}, 20000);*/

	/*it(`Standard JS Plugin: Same as Standard JS but as a plugin.`, async () => {
		const project_name = 'JSTANDARP';
		await exec(`npm exec create-robo ${project_name} -js --plugin -f prettier, eslint`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, ".env");
		const prettier_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `prettier.config.mjs`);
		const md_file_path = fs.access(path.join(FOLDER_PROJECTS_TEST_PATH, project_name, "DEVELOPMENT.md")).then(() => true).catch(() => false);
		const isPlugin = (await fs.readFile(path.join(FOLDER_PROJECTS_TEST_PATH, project_name, "config", "robo.mjs"))).includes("type: 'plugin'");
		const isPrettier = 	await areFeaturesSet(prettier_file_path)
		const isCredentialsSet = await areCredentialsSet(env_file_path)
		if(md_file_path && isPrettier && isCredentialsSet){
			expect(isPlugin).toBeTruthy();
		}

	}, 20000)


	it(`Standard TS Plugin: Same as Standard TS but as a plugin.`, async () => {
		const project_name = 'TSTANDARDP';
		await exec(`pnpx create-robo ${project_name}  -rv 0.9.9 -ts --plugin -f prettier, eslint`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})

		const env_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, ".env");
		const prettier_file_path = path.join(FOLDER_PROJECTS_TEST_PATH, project_name, `prettier.config.mjs`);
		const md_file_path = fs.access(path.join(FOLDER_PROJECTS_TEST_PATH, project_name, "DEVELOPMENT.md")).then(() => true).catch(() => false);
		const isPlugin = (await fs.readFile(path.join(FOLDER_PROJECTS_TEST_PATH, project_name, "config", "robo.mjs"))).includes("type: 'plugin'");
		const isPrettier = 	await areFeaturesSet(prettier_file_path)
		const isCredentialsSet = await areCredentialsSet(env_file_path)

		if(md_file_path && isPrettier && isCredentialsSet){
			expect(isPlugin).toBeTruthy();
		}
	}, 20000)*/

	/*it(`Plugins: Same as Standard TS but with the api and ai plugins installed.`, async () => {
		await exec(`bunx create-robo STWAPIAI -rv 0.9.9 -ts -f prettier, eslint -p @roboplay/plugin-ai @roboplay/plugin-api`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})
	}, 20000)*/

	// Package Managers

	/*	it(`Standard TypeScript But PNPX: TypeScript, recommended features, and credentials.`, async () => {
		await exec(`pnpx create-robo TRFC -ts -f prettier, eslint`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})
	}, 20000)

	// yarn being different we gotta use "robo" and not "create-robo".

	it(`Standard TypeScript But Yarn create: TypeScript, recommended features, and credentials.`, async () => {
		await exec(`yarn create robo YTRFC -ts -f prettier, eslint`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})
	}, 20000)

	// Bun X 

	it(`Standard TypeScript But BUNX: TypeScript, recommended features, and credentials.`, async () => {
		await exec(`bunx create-robo TRFC -ts -f prettier, eslint`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})
	}, 20000)


	// Specials ! 


	it(`Plugins: Same as Standard TS but with the api and ai plugins installed.`, async () => {
		await exec(`bunx create-robo STWAPIAI -ts -f prettier, eslint --plugins @roboplay/plugin-ai, @roboplay/plugin-api`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})
	}, 20000)


	it(`Robo Version: Same as Standard TS but using a specific version of Robo.js.`, async () => {
		await exec(`bunx create-robo STWV -ts -rv 0.9.0 -f prettier, eslint`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})
	}, 20000)


	it(`No Install: Same as Standard TS minus the installation of dependencies.`, async () => {
		await exec(`bunx create-robo STMI -ts -f -ni prettier, eslint`, true, {
			cwd: FOLDER_PROJECTS_TEST_PATH
		})
	}, 20000)*/
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

			if (convertString.includes('Client') || convertString.includes('Token')) {
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
