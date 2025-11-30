/**
 * Environment Manifest Generator
 *
 * Generates env.json with environment variable status information.
 * Validates variables against known patterns without exposing actual values.
 */

import type { EnvMetadata, EnvPattern, EnvVariableStatus } from '../../types/manifest-v1.js'

/**
 * Known patterns for common environment variables.
 * Plugins can register additional patterns.
 */
const knownPatterns: Record<string, EnvPattern> = {
	DISCORD_TOKEN: {
		name: 'Discord Bot Token',
		minLength: 70,
		maxLength: 80
	},
	DISCORD_CLIENT_ID: {
		name: 'Discord Client ID',
		minLength: 17,
		maxLength: 19,
		regex: /^\d+$/
	},
	DISCORD_CLIENT_SECRET: {
		name: 'Discord Client Secret',
		minLength: 32,
		maxLength: 32
	},
	DATABASE_URL: {
		name: 'Database URL',
		regex: /^(postgres|postgresql|mysql|mongodb|sqlite|mariadb):\/\//
	},
	OPENAI_API_KEY: {
		name: 'OpenAI API Key',
		minLength: 40,
		regex: /^sk-/
	},
	ANTHROPIC_API_KEY: {
		name: 'Anthropic API Key',
		minLength: 40,
		regex: /^sk-ant-/
	},
	ROBOPLAY_API_KEY: {
		name: 'RoboPlay API Key',
		minLength: 20
	},
	PORT: {
		name: 'Server Port',
		regex: /^\d+$/
	},
	NODE_ENV: {
		name: 'Node Environment',
		regex: /^(development|production|test)$/
	}
}

/**
 * Custom patterns registered by plugins.
 */
const customPatterns: Record<string, EnvPattern> = {}

/**
 * Register a custom pattern for validating environment variables.
 * Plugins can use this to add validation for their specific variables.
 */
export function registerEnvPattern(key: string, pattern: EnvPattern): void {
	customPatterns[key] = pattern
}

/**
 * Get the pattern for an environment variable.
 */
function getPattern(key: string): EnvPattern | undefined {
	return customPatterns[key] ?? knownPatterns[key]
}

/**
 * Validate a single environment variable against known patterns.
 */
export function validateEnvVar(key: string, value: string | undefined): EnvVariableStatus {
	if (value === undefined) {
		return {
			exists: false,
			empty: true,
			length: 0,
			pattern: 'missing'
		}
	}

	if (value === '') {
		return {
			exists: true,
			empty: true,
			length: 0,
			pattern: 'empty'
		}
	}

	const pattern = getPattern(key)
	let patternStatus: 'valid' | 'invalid' = 'valid'

	if (pattern) {
		if (pattern.minLength && value.length < pattern.minLength) {
			patternStatus = 'invalid'
		}
		if (pattern.maxLength && value.length > pattern.maxLength) {
			patternStatus = 'invalid'
		}
		if (pattern.regex && !pattern.regex.test(value)) {
			patternStatus = 'invalid'
		}
	}

	return {
		exists: true,
		empty: false,
		length: value.length,
		pattern: patternStatus
	}
}

/**
 * Generate environment metadata for the manifest.
 *
 * @param variableNames - List of environment variable names to check
 * @param requiredVariables - List of variables that are required
 * @param env - Optional environment object (defaults to process.env)
 */
export function generateEnvMetadata(
	variableNames: string[],
	requiredVariables: string[] = [],
	env: Record<string, string | undefined> = process.env
): EnvMetadata {
	const variables: Record<string, EnvVariableStatus> = {}
	let setCount = 0
	let emptyCount = 0
	let missingCount = 0

	for (const name of variableNames) {
		const status = validateEnvVar(name, env[name])
		variables[name] = status

		if (status.exists && !status.empty) {
			setCount++
		} else if (status.exists && status.empty) {
			emptyCount++
		} else {
			missingCount++
		}
	}

	const satisfied: string[] = []
	const missing: string[] = []

	for (const name of requiredVariables) {
		const status = variables[name]
		if (status?.exists && !status.empty) {
			satisfied.push(name)
		} else {
			missing.push(name)
		}
	}

	return {
		variables,
		summary: {
			total: variableNames.length,
			set: setCount,
			empty: emptyCount,
			missing: missingCount
		},
		required: {
			satisfied,
			missing
		}
	}
}

/**
 * Extract environment variable names from config.
 * Looks for {{VAR_NAME}} patterns in config values.
 */
export function extractEnvVarsFromConfig(config: Record<string, unknown>): string[] {
	const vars = new Set<string>()
	const pattern = /\{\{([^}]+)\}\}/g
	const seen = new WeakSet<object>()

	function traverse(obj: unknown): void {
		if (typeof obj === 'string') {
			let match
			while ((match = pattern.exec(obj)) !== null) {
				vars.add(match[1])
			}
		} else if (Array.isArray(obj)) {
			// Guard against circular references
			if (seen.has(obj)) {
				return
			}
			seen.add(obj)
			for (const item of obj) {
				traverse(item)
			}
		} else if (obj && typeof obj === 'object') {
			// Guard against circular references
			if (seen.has(obj)) {
				return
			}
			seen.add(obj)
			for (const value of Object.values(obj)) {
				traverse(value)
			}
		}
	}

	traverse(config)
	return Array.from(vars)
}

/**
 * Get all registered pattern names (built-in + custom).
 */
export function getRegisteredPatterns(): string[] {
	return [...Object.keys(knownPatterns), ...Object.keys(customPatterns)]
}
