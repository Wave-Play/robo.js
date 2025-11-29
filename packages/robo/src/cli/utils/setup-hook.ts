import { exec as execCallback } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { logger } from '../../core/logger.js'
import { Env } from '../../core/env.js'
import { inferNamespace } from '../../core/hooks.js'
import type { SetupContext, PromptQuestion } from '../../types/lifecycle.js'
import readline from 'node:readline'

const execAsync = promisify(execCallback)

/**
 * Check if a file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath)
		return true
	} catch {
		return false
	}
}

/**
 * Create a prompt function using readline.
 * For richer prompts, plugins can use @inquirer/prompts directly.
 */
function createPromptFunction(): SetupContext['prompt'] {
	return async <T>(questions: PromptQuestion[]): Promise<T> => {
		const answers: Record<string, unknown> = {}

		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout
		})

		const question = (q: string): Promise<string> => {
			return new Promise((resolve) => {
				rl.question(q, resolve)
			})
		}

		for (const q of questions) {
			if (q.when === false) continue

			let answer: unknown

			switch (q.type) {
				case 'confirm': {
					const defaultHint = q.default ? '(Y/n)' : '(y/N)'
					const input = await question(`${q.message} ${defaultHint}: `)
					answer = input.toLowerCase() === 'y' || (input === '' && q.default === true)
					break
				}
				case 'list': {
					// Simple list selection - show numbered choices
					if (q.choices && q.choices.length > 0) {
						console.log(`${q.message}`)
						q.choices.forEach((choice, index) => {
							const label = typeof choice === 'string' ? choice : choice.name
							console.log(`  ${index + 1}. ${label}`)
						})
						const input = await question(`Enter number (1-${q.choices.length}): `)
						const selectedIndex = parseInt(input, 10) - 1
						if (selectedIndex >= 0 && selectedIndex < q.choices.length) {
							const selected = q.choices[selectedIndex]
							answer = typeof selected === 'string' ? selected : selected.value
						} else {
							answer = q.default
						}
					} else {
						answer = q.default
					}
					break
				}
				case 'checkbox': {
					// Simple checkbox - comma-separated indices
					if (q.choices && q.choices.length > 0) {
						console.log(`${q.message} (enter comma-separated numbers)`)
						q.choices.forEach((choice, index) => {
							const label = typeof choice === 'string' ? choice : choice.name
							console.log(`  ${index + 1}. ${label}`)
						})
						const input = await question(`Enter numbers: `)
						const indices = input
							.split(',')
							.map((s) => parseInt(s.trim(), 10) - 1)
							.filter((i) => i >= 0 && i < q.choices!.length)
						answer = indices.map((i) => {
							const choice = q.choices![i]
							return typeof choice === 'string' ? choice : choice.value
						})
					} else {
						answer = []
					}
					break
				}
				case 'password':
				case 'input':
				default: {
					const defaultHint = q.default ? ` (${q.default})` : ''
					const input = await question(`${q.message}${defaultHint}: `)
					answer = input || q.default || ''
					break
				}
			}

			answers[q.name] = answer
		}

		rl.close()
		return answers as T
	}
}

/**
 * Run setup hook for a plugin after installation.
 */
export async function runSetupHook(
	packageName: string,
	packageVersion: string,
	trigger: 'create' | 'add',
	packageType: 'template' | 'plugin' = 'plugin'
): Promise<void> {
	// Look for setup hook in plugin package (compiled JS only)
	const possiblePaths = [
		path.join(process.cwd(), 'node_modules', packageName, '.robo', 'build', 'robo', 'setup.js'),
		path.join(process.cwd(), 'node_modules', packageName, 'dist', 'robo', 'setup.js')
	]

	let hookPath: string | null = null
	for (const p of possiblePaths) {
		if (await fileExists(p)) {
			hookPath = p
			break
		}
	}

	if (!hookPath) {
		return // No setup hook found
	}

	const context: SetupContext = {
		trigger,
		logger: logger.fork(inferNamespace(packageName)),
		env: Env,
		paths: {
			root: process.cwd(),
			src: path.join(process.cwd(), 'src'),
			config: path.join(process.cwd(), 'config')
		},
		exec: async (command: string) => {
			return execAsync(command, { cwd: process.cwd() })
		},
		prompt: createPromptFunction(),
		package: {
			name: packageName,
			version: packageVersion,
			type: packageType
		}
	}

	try {
		const hookModule = await import(pathToFileURL(hookPath).href)
		if (typeof hookModule.default === 'function') {
			await hookModule.default(context)
		}
	} catch (error) {
		logger.warn(`Setup hook for ${packageName} failed:`, error)
	}
}
