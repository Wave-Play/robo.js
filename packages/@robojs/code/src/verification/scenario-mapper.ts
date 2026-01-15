/**
 * Scenario Execution Mapping for @robojs/code SDK
 *
 * Maps ScenarioSpec kinds to verification actions.
 */

import type { ScenarioSpec, ScenarioStep } from '../types/acceptance.js'
import type { ProjectProfile } from '../types/robo.js'
import type { TestRunnerConfig } from './runner-selection.js'

/**
 * Types of verification actions
 */
export type VerificationActionType = 'build' | 'test' | 'mock' | 'manual'

/**
 * Base verification action
 */
export interface BaseVerificationAction {
	type: VerificationActionType
	scenarioId: string
	title: string
}

/**
 * Build verification action
 */
export interface BuildVerificationAction extends BaseVerificationAction {
	type: 'build'
	command: string
	args: string[]
}

/**
 * Test verification action
 */
export interface TestVerificationAction extends BaseVerificationAction {
	type: 'test'
	runner: TestRunnerConfig
}

/**
 * Mock verification action
 */
export interface MockVerificationAction extends BaseVerificationAction {
	type: 'mock'
	steps: ScenarioStep[]
	assertions: string[]
}

/**
 * Manual verification action
 */
export interface ManualVerificationAction extends BaseVerificationAction {
	type: 'manual'
	steps: ScenarioStep[]
	requiresConfirmation: boolean
}

/**
 * Union type for all verification actions
 */
export type VerificationAction =
	| BuildVerificationAction
	| TestVerificationAction
	| MockVerificationAction
	| ManualVerificationAction

/**
 * Context for mapping scenarios
 */
export interface ScenarioMappingContext {
	/** Detected project profile */
	profile: ProjectProfile | null
	/** Detected test runner config */
	testRunner: TestRunnerConfig | null
}

/**
 * Map a single scenario to a verification action
 *
 * @param scenario - The scenario to map
 * @param context - Mapping context with project info
 * @returns Verification action
 */
export function mapScenarioToAction(scenario: ScenarioSpec, context: ScenarioMappingContext): VerificationAction {
	switch (scenario.kind) {
		case 'build':
			return mapBuildScenario(scenario, context)

		case 'test':
			return mapTestScenario(scenario, context)

		case 'mock':
			return mapMockScenario(scenario, context)

		case 'manual':
			return mapManualScenario(scenario)
	}
}

/**
 * Map a build scenario to a build action
 */
function mapBuildScenario(scenario: ScenarioSpec, context: ScenarioMappingContext): BuildVerificationAction {
	// Use robo build for Robo projects, npm run build otherwise
	const isRoboProject = context.profile?.kind !== 'unknown' && context.profile !== null

	return {
		type: 'build',
		scenarioId: scenario.id,
		title: scenario.title,
		command: isRoboProject ? 'robo' : 'npm',
		args: isRoboProject ? ['build'] : ['run', 'build']
	}
}

/**
 * Map a test scenario to a test action
 */
function mapTestScenario(scenario: ScenarioSpec, context: ScenarioMappingContext): TestVerificationAction {
	// Get test pattern from tool hints if available
	const pattern = scenario.toolHints?.testPattern

	// Use detected runner or fall back to npm test
	const runner: TestRunnerConfig = context.testRunner ?? {
		cmd: 'npm',
		args: pattern ? ['test', '--', pattern] : ['test'],
		type: 'npm-script'
	}

	// If pattern specified and runner supports it, add to args
	if (pattern && runner.type !== 'npm-script') {
		const runnerWithPattern = { ...runner }
		if (runner.type === 'vitest' || runner.type === 'jest') {
			runnerWithPattern.args = [...runner.args, '--testPathPattern', pattern]
		} else if (runner.type === 'mocha') {
			runnerWithPattern.args = [...runner.args, pattern]
		}
		runnerWithPattern.pattern = pattern
		return {
			type: 'test',
			scenarioId: scenario.id,
			title: scenario.title,
			runner: runnerWithPattern
		}
	}

	return {
		type: 'test',
		scenarioId: scenario.id,
		title: scenario.title,
		runner
	}
}

/**
 * Map a mock scenario to a mock action
 */
function mapMockScenario(scenario: ScenarioSpec, context: ScenarioMappingContext): MockVerificationAction {
	return {
		type: 'mock',
		scenarioId: scenario.id,
		title: scenario.title,
		steps: scenario.steps ?? [],
		assertions: scenario.assertions ?? []
	}
}

/**
 * Map a manual scenario to a manual action
 */
function mapManualScenario(scenario: ScenarioSpec): ManualVerificationAction {
	return {
		type: 'manual',
		scenarioId: scenario.id,
		title: scenario.title,
		steps: scenario.steps ?? [],
		requiresConfirmation: true
	}
}

/**
 * Map all scenarios to verification actions
 *
 * @param scenarios - Array of scenarios
 * @param context - Mapping context
 * @returns Array of verification actions
 */
export function mapScenariosToActions(
	scenarios: ScenarioSpec[],
	context: ScenarioMappingContext
): VerificationAction[] {
	return scenarios.map((scenario) => mapScenarioToAction(scenario, context))
}

/**
 * Group verification actions by type
 *
 * @param actions - Array of verification actions
 * @returns Object with actions grouped by type
 */
export function groupActionsByType(actions: VerificationAction[]): {
	build: BuildVerificationAction[]
	test: TestVerificationAction[]
	mock: MockVerificationAction[]
	manual: ManualVerificationAction[]
} {
	return {
		build: actions.filter((a): a is BuildVerificationAction => a.type === 'build'),
		test: actions.filter((a): a is TestVerificationAction => a.type === 'test'),
		mock: actions.filter((a): a is MockVerificationAction => a.type === 'mock'),
		manual: actions.filter((a): a is ManualVerificationAction => a.type === 'manual')
	}
}

/**
 * Check if any scenarios require mock server
 *
 * @param scenarios - Array of scenarios
 * @returns True if any scenario needs mock
 */
export function requiresMockServer(scenarios: ScenarioSpec[]): boolean {
	return scenarios.some((s) => s.kind === 'mock' || s.toolHints?.requiresMock)
}

/**
 * Check if any scenarios require dev server
 *
 * @param scenarios - Array of scenarios
 * @returns True if any scenario needs dev server
 */
export function requiresDevServer(scenarios: ScenarioSpec[]): boolean {
	return scenarios.some((s) => s.toolHints?.requiresDevServer)
}

/**
 * Check if any scenarios have manual steps
 *
 * @param scenarios - Array of scenarios
 * @returns True if any scenario has manual steps
 */
export function hasManualScenarios(scenarios: ScenarioSpec[]): boolean {
	return scenarios.some((s) => s.kind === 'manual')
}
