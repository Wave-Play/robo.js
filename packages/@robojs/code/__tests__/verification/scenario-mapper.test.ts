/**
 * Unit tests for Scenario Mapping
 */

import { describe, it, expect } from '@jest/globals'
import {
	mapScenarioToAction,
	mapScenariosToActions,
	groupActionsByType,
	requiresMockServer,
	requiresDevServer,
	hasManualScenarios,
	type ScenarioMappingContext
} from '../../src/verification/scenario-mapper.js'
import type { TestRunnerConfig } from '../../src/verification/runner-selection.js'
import type { ScenarioSpec } from '../../src/types/acceptance.js'

// Helper to create a scenario spec
function createScenario(id: string, kind: ScenarioSpec['kind'], overrides: Partial<ScenarioSpec> = {}): ScenarioSpec {
	return {
		id,
		title: `Test ${id}`,
		description: `Description for ${id}`,
		kind,
		...overrides
	}
}

// Default test context
const defaultContext: ScenarioMappingContext = {
	profile: null,
	testRunner: null
}

// Robo project context
const roboContext: ScenarioMappingContext = {
	profile: {
		kind: 'bot',
		plugins: ['@robojs/discordjs'],
		hasMock: true,
		directories: { commands: '/src/commands' },
		hasConfig: true
	},
	testRunner: {
		cmd: 'npx',
		args: ['vitest', 'run'],
		type: 'vitest'
	}
}

describe('mapScenarioToAction', () => {
	describe('build scenarios', () => {
		it('should map build scenario for Robo project', () => {
			const scenario = createScenario('build-1', 'build')

			const action = mapScenarioToAction(scenario, roboContext)

			expect(action.type).toBe('build')
			expect(action.scenarioId).toBe('build-1')
			expect(action.title).toBe('Test build-1')
			if (action.type === 'build') {
				expect(action.command).toBe('robo')
				expect(action.args).toEqual(['build'])
			}
		})

		it('should map build scenario for non-Robo project', () => {
			const scenario = createScenario('build-1', 'build')

			const action = mapScenarioToAction(scenario, defaultContext)

			expect(action.type).toBe('build')
			if (action.type === 'build') {
				expect(action.command).toBe('npm')
				expect(action.args).toEqual(['run', 'build'])
			}
		})

		it('should use npm for unknown project kind', () => {
			const context: ScenarioMappingContext = {
				profile: { kind: 'unknown', plugins: [], hasMock: false, directories: {}, hasConfig: false },
				testRunner: null
			}
			const scenario = createScenario('build-1', 'build')

			const action = mapScenarioToAction(scenario, context)

			if (action.type === 'build') {
				expect(action.command).toBe('npm')
			}
		})
	})

	describe('test scenarios', () => {
		it('should map test scenario with detected runner', () => {
			const scenario = createScenario('test-1', 'test')

			const action = mapScenarioToAction(scenario, roboContext)

			expect(action.type).toBe('test')
			expect(action.scenarioId).toBe('test-1')
			if (action.type === 'test') {
				expect(action.runner.type).toBe('vitest')
				expect(action.runner.cmd).toBe('npx')
			}
		})

		it('should fallback to npm test when no runner detected', () => {
			const scenario = createScenario('test-1', 'test')

			const action = mapScenarioToAction(scenario, defaultContext)

			expect(action.type).toBe('test')
			if (action.type === 'test') {
				expect(action.runner.type).toBe('npm-script')
				expect(action.runner.cmd).toBe('npm')
				expect(action.runner.args).toEqual(['test'])
			}
		})

		it('should use testPattern from toolHints with npm', () => {
			const scenario = createScenario('test-1', 'test', {
				toolHints: { testPattern: 'unit/**/*.spec.ts' }
			})

			const action = mapScenarioToAction(scenario, defaultContext)

			if (action.type === 'test') {
				expect(action.runner.args).toEqual(['test', '--', 'unit/**/*.spec.ts'])
			}
		})

		it('should add testPattern for vitest runner', () => {
			const scenario = createScenario('test-1', 'test', {
				toolHints: { testPattern: 'unit/**/*.spec.ts' }
			})

			const action = mapScenarioToAction(scenario, roboContext)

			if (action.type === 'test') {
				expect(action.runner.args).toContain('--testPathPattern')
				expect(action.runner.args).toContain('unit/**/*.spec.ts')
				expect(action.runner.pattern).toBe('unit/**/*.spec.ts')
			}
		})

		it('should add testPattern for jest runner', () => {
			const jestContext: ScenarioMappingContext = {
				profile: null,
				testRunner: {
					cmd: 'npx',
					args: ['jest'],
					type: 'jest'
				}
			}
			const scenario = createScenario('test-1', 'test', {
				toolHints: { testPattern: 'e2e/' }
			})

			const action = mapScenarioToAction(scenario, jestContext)

			if (action.type === 'test') {
				expect(action.runner.args).toContain('--testPathPattern')
				expect(action.runner.args).toContain('e2e/')
			}
		})

		it('should add testPattern directly for mocha runner', () => {
			const mochaContext: ScenarioMappingContext = {
				profile: null,
				testRunner: {
					cmd: 'npx',
					args: ['mocha'],
					type: 'mocha'
				}
			}
			const scenario = createScenario('test-1', 'test', {
				toolHints: { testPattern: 'test/*.spec.js' }
			})

			const action = mapScenarioToAction(scenario, mochaContext)

			if (action.type === 'test') {
				expect(action.runner.args).toContain('test/*.spec.js')
				expect(action.runner.args).not.toContain('--testPathPattern')
			}
		})
	})

	describe('mock scenarios', () => {
		it('should map mock scenario', () => {
			const scenario = createScenario('mock-1', 'mock', {
				steps: [{ action: 'send message', input: '/ping' }],
				assertions: ['response contains "pong"']
			})

			const action = mapScenarioToAction(scenario, roboContext)

			expect(action.type).toBe('mock')
			expect(action.scenarioId).toBe('mock-1')
			if (action.type === 'mock') {
				expect(action.steps).toHaveLength(1)
				expect(action.assertions).toHaveLength(1)
			}
		})

		it('should handle mock scenario with empty steps', () => {
			const scenario = createScenario('mock-1', 'mock')

			const action = mapScenarioToAction(scenario, roboContext)

			if (action.type === 'mock') {
				expect(action.steps).toEqual([])
				expect(action.assertions).toEqual([])
			}
		})
	})

	describe('manual scenarios', () => {
		it('should map manual scenario', () => {
			const scenario = createScenario('manual-1', 'manual', {
				steps: [{ action: 'verify UI looks correct', expected: 'UI is correct' }]
			})

			const action = mapScenarioToAction(scenario, defaultContext)

			expect(action.type).toBe('manual')
			expect(action.scenarioId).toBe('manual-1')
			if (action.type === 'manual') {
				expect(action.steps).toHaveLength(1)
				expect(action.requiresConfirmation).toBe(true)
			}
		})

		it('should always require confirmation for manual scenarios', () => {
			const scenario = createScenario('manual-1', 'manual')

			const action = mapScenarioToAction(scenario, defaultContext)

			if (action.type === 'manual') {
				expect(action.requiresConfirmation).toBe(true)
			}
		})
	})
})

describe('mapScenariosToActions', () => {
	it('should map all scenarios', () => {
		const scenarios = [
			createScenario('build-1', 'build'),
			createScenario('test-1', 'test'),
			createScenario('mock-1', 'mock')
		]

		const actions = mapScenariosToActions(scenarios, roboContext)

		expect(actions).toHaveLength(3)
		expect(actions[0].type).toBe('build')
		expect(actions[1].type).toBe('test')
		expect(actions[2].type).toBe('mock')
	})

	it('should preserve scenario order', () => {
		const scenarios = [createScenario('a', 'mock'), createScenario('b', 'build'), createScenario('c', 'test')]

		const actions = mapScenariosToActions(scenarios, roboContext)

		expect(actions[0].scenarioId).toBe('a')
		expect(actions[1].scenarioId).toBe('b')
		expect(actions[2].scenarioId).toBe('c')
	})

	it('should handle empty array', () => {
		const actions = mapScenariosToActions([], roboContext)
		expect(actions).toEqual([])
	})
})

describe('groupActionsByType', () => {
	it('should group actions by type', () => {
		const scenarios = [
			createScenario('build-1', 'build'),
			createScenario('test-1', 'test'),
			createScenario('test-2', 'test'),
			createScenario('mock-1', 'mock'),
			createScenario('manual-1', 'manual')
		]

		const actions = mapScenariosToActions(scenarios, roboContext)
		const grouped = groupActionsByType(actions)

		expect(grouped.build).toHaveLength(1)
		expect(grouped.test).toHaveLength(2)
		expect(grouped.mock).toHaveLength(1)
		expect(grouped.manual).toHaveLength(1)
	})

	it('should return empty arrays for missing types', () => {
		const scenarios = [createScenario('build-1', 'build')]

		const actions = mapScenariosToActions(scenarios, roboContext)
		const grouped = groupActionsByType(actions)

		expect(grouped.build).toHaveLength(1)
		expect(grouped.test).toHaveLength(0)
		expect(grouped.mock).toHaveLength(0)
		expect(grouped.manual).toHaveLength(0)
	})

	it('should handle empty actions array', () => {
		const grouped = groupActionsByType([])

		expect(grouped.build).toHaveLength(0)
		expect(grouped.test).toHaveLength(0)
		expect(grouped.mock).toHaveLength(0)
		expect(grouped.manual).toHaveLength(0)
	})
})

describe('requiresMockServer', () => {
	it('should return true for mock scenarios', () => {
		const scenarios = [createScenario('build-1', 'build'), createScenario('mock-1', 'mock')]

		expect(requiresMockServer(scenarios)).toBe(true)
	})

	it('should return true when toolHints.requiresMock is true', () => {
		const scenarios = [
			createScenario('test-1', 'test', {
				toolHints: { requiresMock: true }
			})
		]

		expect(requiresMockServer(scenarios)).toBe(true)
	})

	it('should return false when no mock scenarios', () => {
		const scenarios = [createScenario('build-1', 'build'), createScenario('test-1', 'test')]

		expect(requiresMockServer(scenarios)).toBe(false)
	})

	it('should return false for empty array', () => {
		expect(requiresMockServer([])).toBe(false)
	})
})

describe('requiresDevServer', () => {
	it('should return true when toolHints.requiresDevServer is true', () => {
		const scenarios = [
			createScenario('test-1', 'test', {
				toolHints: { requiresDevServer: true }
			})
		]

		expect(requiresDevServer(scenarios)).toBe(true)
	})

	it('should return false when no dev server required', () => {
		const scenarios = [createScenario('build-1', 'build'), createScenario('test-1', 'test')]

		expect(requiresDevServer(scenarios)).toBe(false)
	})

	it('should return false for empty array', () => {
		expect(requiresDevServer([])).toBe(false)
	})
})

describe('hasManualScenarios', () => {
	it('should return true for manual scenarios', () => {
		const scenarios = [createScenario('test-1', 'test'), createScenario('manual-1', 'manual')]

		expect(hasManualScenarios(scenarios)).toBe(true)
	})

	it('should return false when no manual scenarios', () => {
		const scenarios = [createScenario('build-1', 'build'), createScenario('mock-1', 'mock')]

		expect(hasManualScenarios(scenarios)).toBe(false)
	})

	it('should return false for empty array', () => {
		expect(hasManualScenarios([])).toBe(false)
	})
})
