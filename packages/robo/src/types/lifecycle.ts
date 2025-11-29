import type { Logger } from '../core/logger.js'
import type { Env } from '../core/env.js'
import type { Config } from './config.js'

/**
 * Context provided to init hooks.
 * Runs BEFORE manifest loading and portal population.
 * Use for early setup like log drains, monkey-patching internals.
 */
export interface InitContext {
	config: Config
	logger: Logger
	env: typeof Env
	mode: 'development' | 'production'
}

/**
 * Context provided to setup hooks.
 * Runs during CLI operations: create-robo or robo add.
 */
export interface SetupContext {
	trigger: 'create' | 'add'
	logger: Logger
	env: typeof Env
	paths: {
		root: string
		src: string
		config: string
	}
	exec: (command: string) => Promise<{ stdout: string; stderr: string }>
	prompt: <T>(questions: PromptQuestion[]) => Promise<T>
	package: {
		name: string
		version: string
		type: 'template' | 'plugin'
	}
}

export interface PromptQuestion {
	type: 'input' | 'password' | 'confirm' | 'list' | 'checkbox'
	name: string
	message: string
	default?: unknown
	choices?: Array<string | { name: string; value: unknown }>
	when?: boolean
}

export default {}
