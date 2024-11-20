import { Command } from 'commander'
import { Dirent } from 'node:fs'
import { access, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { exec, getPackageManager } from '../core/utils.js'
import { logger } from '../core/logger.js'
import { select } from '@inquirer/prompts'
import type { PackageJson } from '../core/types.js'

const command = new Command('typescript')
	.description('Turns your Javascript project into Typescript!')
	.action(codemodAction)

export default command

interface ProjectInfo {
	hasSWC: boolean
}

const TSCONFIG = `{
	"compilerOptions": {
		"target": "ESNext",
		"lib": ["esnext"],
		"allowJs": true,
		"skipLibCheck": true,
		"strict": true,
		"forceConsistentCasingInFileNames": true,
		"esModuleInterop": true,
		"module": "esnext",
		"moduleResolution": "node",
		"resolveJsonModule": true,
		"isolatedModules": true,
		"incremental": true
	},
	"include": ["**/*.ts"],
	"exclude": ["node_modules"]
}`

async function codemodAction() {
	const packageManager = getPackageManager()
	const command = packageManager === 'npm' ? 'install' : 'add'
	const tsconfigPath = path.join(process.cwd(), 'tsconfig.json')
	const packageJsonPath = path.join(process.cwd(), 'package.json')
	const packageJson: PackageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'))

	const projectInfo: ProjectInfo = {
		hasSWC: packageJson.devDependencies
			? !!packageJson.devDependencies['@swc/core']
			: !!packageJson.dependencies['@swc/core']
	}

	try {
		if (!projectInfo.hasSWC) {
			await exec(`${packageManager} ${command} --save-dev @swc/core typescript`)
		}
		const tsFileExist = await access(tsconfigPath)
			.then(() => true)
			.catch(() => false)

		if (tsFileExist) {
			const userTSCONFIG = await readFile(tsconfigPath, 'utf-8')
			if (userTSCONFIG !== TSCONFIG) {
				const tsconfig = await select({
					message: `tsconfig found !, would you like your tsconfig file be overwritten ?`,
					choices: [
						{ name: 'Yes', value: true },
						{ name: 'No', value: false }
					]
				})

				if (tsconfig) {
					await writeFile(tsconfigPath, TSCONFIG)
				}
			}
		} else {
			await writeFile(tsconfigPath, TSCONFIG)
		}

		await convertJsToTS()
	} catch (e) {
		logger.error(e)
		process.exit(1)
	}
}

// walk dir recursively

async function convertJsToTS() {
	const dir = path.join(process.cwd(), 'src')
	const walk = async (filePath: string) => {
		const cwd = await readdir(filePath, { withFileTypes: true })
		cwd.forEach((file: Dirent) => {
			if (path.extname(file.name) === '.js') {
				const convertedFileType = file.name.replace('js', 'ts')
				const jsFilePath = path.join(filePath, file.name)
				const tsFilePath = path.join(filePath, convertedFileType)
				rename(jsFilePath, tsFilePath)
			}
			if (file.isDirectory()) {
				const dirPath = path.join(filePath, file.name)
				return walk(dirPath)
			}
		})
	}
	await walk(dir)
}
