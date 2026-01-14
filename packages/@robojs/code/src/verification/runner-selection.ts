/**
 * Test Runner Selection for @robojs/code SDK
 *
 * Auto-detects the appropriate test runner based on package.json scripts
 * and configuration files.
 */

import type { ExecutionProvider } from '../types/execution.js'

/**
 * Configuration for a test runner
 */
export interface TestRunnerConfig {
	/** Command to execute */
	cmd: string
	/** Command arguments */
	args: string[]
	/** Detected runner type */
	type: 'vitest' | 'jest' | 'mocha' | 'node-test' | 'npm-script' | 'unknown'
	/** Optional test pattern */
	pattern?: string
}

/**
 * Package.json scripts and dependencies for detection
 */
export interface PackageJsonInfo {
	scripts?: Record<string, string>
	dependencies?: Record<string, string>
	devDependencies?: Record<string, string>
}

/**
 * Known test script patterns
 */
const TEST_SCRIPT_PATTERNS = [
	{ script: 'test', priority: 1 },
	{ script: 'test:unit', priority: 2 },
	{ script: 'test:all', priority: 3 },
	{ script: 'test:integration', priority: 4 }
] as const

/**
 * Known test runner patterns in script content
 */
const RUNNER_PATTERNS = {
	vitest: /\bvitest\b/,
	jest: /\bjest\b/,
	mocha: /\bmocha\b/,
	nodeTest: /\bnode\s+--test\b/
} as const

/**
 * Test runner config files to check for
 */
const CONFIG_FILES = {
	vitest: ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mjs'],
	jest: ['jest.config.ts', 'jest.config.js', 'jest.config.mjs', 'jest.config.json'],
	mocha: ['.mocharc.js', '.mocharc.json', '.mocharc.yaml', '.mocharc.yml']
} as const

/**
 * Detect the test runner type from script content
 */
function detectRunnerType(scriptContent: string): 'vitest' | 'jest' | 'mocha' | 'node-test' | 'unknown' {
	if (RUNNER_PATTERNS.vitest.test(scriptContent)) return 'vitest'
	if (RUNNER_PATTERNS.jest.test(scriptContent)) return 'jest'
	if (RUNNER_PATTERNS.mocha.test(scriptContent)) return 'mocha'
	if (RUNNER_PATTERNS.nodeTest.test(scriptContent)) return 'node-test'
	return 'unknown'
}

/**
 * Detect test runner from package.json scripts
 *
 * @param pkg - Package.json info
 * @returns Test runner config or null if no runner found
 */
export function detectTestRunnerFromPackage(pkg: PackageJsonInfo): TestRunnerConfig | null {
	if (!pkg.scripts) return null

	// Sort scripts by priority
	const sortedPatterns = [...TEST_SCRIPT_PATTERNS].sort((a, b) => a.priority - b.priority)

	for (const { script } of sortedPatterns) {
		const scriptContent = pkg.scripts[script]
		if (!scriptContent) continue

		const type = detectRunnerType(scriptContent)

		return {
			cmd: 'npm',
			args: ['run', script],
			type: type === 'unknown' ? 'npm-script' : type
		}
	}

	return null
}

/**
 * Check for test runner config files
 *
 * @param provider - Execution provider for file access
 * @returns Detected runner type or null
 */
export async function detectTestRunnerFromConfig(
	provider: ExecutionProvider
): Promise<'vitest' | 'jest' | 'mocha' | null> {
	// Check for vitest config
	for (const file of CONFIG_FILES.vitest) {
		if (await provider.exists(`/${file}`)) {
			return 'vitest'
		}
	}

	// Check for jest config
	for (const file of CONFIG_FILES.jest) {
		if (await provider.exists(`/${file}`)) {
			return 'jest'
		}
	}

	// Check for mocha config
	for (const file of CONFIG_FILES.mocha) {
		if (await provider.exists(`/${file}`)) {
			return 'mocha'
		}
	}

	return null
}

/**
 * Build a test runner config for a specific runner type
 *
 * @param type - Runner type
 * @param pattern - Optional test pattern
 * @returns Test runner config
 */
export function buildRunnerConfig(type: 'vitest' | 'jest' | 'mocha' | 'node-test', pattern?: string): TestRunnerConfig {
	switch (type) {
		case 'vitest':
			return {
				cmd: 'npx',
				args: pattern ? ['vitest', 'run', '--testPathPattern', pattern] : ['vitest', 'run'],
				type: 'vitest',
				pattern
			}

		case 'jest':
			return {
				cmd: 'npx',
				args: pattern ? ['jest', '--testPathPattern', pattern] : ['jest'],
				type: 'jest',
				pattern
			}

		case 'mocha':
			return {
				cmd: 'npx',
				args: pattern ? ['mocha', pattern] : ['mocha'],
				type: 'mocha',
				pattern
			}

		case 'node-test':
			return {
				cmd: 'node',
				args: pattern ? ['--test', pattern] : ['--test'],
				type: 'node-test',
				pattern
			}
	}
}

/**
 * Detect the best test runner for a project
 *
 * This combines package.json scripts and config file detection.
 * Priority:
 * 1. npm test script (if exists)
 * 2. Config file detection (vitest > jest > mocha)
 * 3. Direct runner detection from dependencies
 *
 * @param provider - Execution provider
 * @param pkg - Package.json info
 * @returns Test runner config or null if no runner found
 */
export async function detectTestRunner(
	provider: ExecutionProvider,
	pkg: PackageJsonInfo
): Promise<TestRunnerConfig | null> {
	// First, check for npm test script
	const scriptConfig = detectTestRunnerFromPackage(pkg)
	if (scriptConfig) {
		return scriptConfig
	}

	// Check for config files
	const configType = await detectTestRunnerFromConfig(provider)
	if (configType) {
		return buildRunnerConfig(configType)
	}

	// Check dependencies for runner packages
	const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }

	if ('vitest' in allDeps) {
		return buildRunnerConfig('vitest')
	}
	if ('jest' in allDeps) {
		return buildRunnerConfig('jest')
	}
	if ('mocha' in allDeps) {
		return buildRunnerConfig('mocha')
	}

	return null
}
