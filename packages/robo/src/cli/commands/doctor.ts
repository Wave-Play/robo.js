import { Command } from '../utils/cli-handler.js'
import fs from 'fs'
import path from 'path'
import { logger } from '../../core/logger.js'
import { color, composeColors } from '../../core/color.js'
import { loadEnv } from '../../core/dotenv.js'

const command = new Command('doctor').description('Checks if your project is healthy').handler(doctor)
export default command

function doctor() {
	loadEnv({ sync: true })
	const results: CheckResult[] = [checkTypescript(), checkStructure(), checkEnvironmentVariables()]
	logger.log(composeColors(color.bold, color.underline)('\nHealth Check Results:'))
	results.forEach((result) => {
		logger.log(color.bold(`${result.ok ? color.green('✓') : color.red('✗')} ${result.message}`))
	})
	logger.log('\n')
}

interface CheckResult {
	ok: boolean
	message: string
}

function checkTypescript(): CheckResult {
	const tsconfigPath = path.join(process.cwd(), 'tsconfig.json')
	const srcPath = path.join(process.cwd(), 'src')
	const tsFiles: string[] = []

	// Recursive function to search for TypeScript files in subdirectories
	function searchDir(dirPath: string): void {
		const files = fs.readdirSync(dirPath)
		files.forEach((file) => {
			const filePath = path.join(dirPath, file)
			const fileStat = fs.statSync(filePath)
			if (fileStat.isDirectory()) {
				searchDir(filePath)
			} else if (path.extname(file) === '.ts') {
				tsFiles.push(filePath)
			}
		})
	}

	if (!fs.existsSync(srcPath)) {
		return {
			ok: true,
			message: 'src directory does not exist (not using TypeScript)'
		}
	}

	// Search for TypeScript files in the src directory and its subdirectories
	searchDir(srcPath)

	if (!fs.existsSync(tsconfigPath)) {
		if (tsFiles.length === 0) {
			return {
				ok: true,
				message: 'No TypeScript files or tsconfig.json found (not using TypeScript)'
			}
		}
		return {
			ok: false,
			message: 'tsconfig.json does not exist (using TypeScript)'
		}
	}

	if (tsFiles.length === 0) {
		return {
			ok: false,
			message: 'No TypeScript files found in src directory or subdirectories (using TypeScript)'
		}
	}

	return {
		ok: true,
		message: 'TypeScript files found and tsconfig.json exists (using TypeScript)'
	}
}

function checkStructure(): CheckResult {
	const eventsPath = path.join(process.cwd(), 'src', 'events')
	const commandsPath = path.join(process.cwd(), 'src', 'commands')

	if (!fs.existsSync(eventsPath) || !fs.readdirSync(eventsPath).length) {
		return {
			ok: false,
			message: 'No files found in /src/events directory'
		}
	}

	if (!fs.existsSync(commandsPath) || !fs.readdirSync(commandsPath).length) {
		return {
			ok: false,
			message: 'No files found in /src/commands directory'
		}
	}

	return {
		ok: true,
		message: 'Files found in /src/events and /src/commands directories'
	}
}

function checkEnvironmentVariables(): CheckResult {
	const requiredVars = ['DISCORD_CLIENT_ID', 'DISCORD_TOKEN']
	const missingVars = requiredVars.filter((variable) => !(process.env[variable]))
	if (missingVars.length === 0) {
		return {
			ok: true,
			message: 'All required environment variables are present'
		}
	}
	return {
		ok: false,
		message: `Missing environment variables: ${missingVars.join(', ')}`
	}
}
