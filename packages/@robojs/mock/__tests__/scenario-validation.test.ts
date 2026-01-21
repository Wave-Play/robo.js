/**
 * ScenarioDefinition validation tests
 *
 * Ensures ScenarioManager.load() rejects structurally invalid scenarios early,
 * preventing executor crashes and silent no-op steps.
 */

import { Session } from '../src/session/session.js'
import type { ScenarioDefinition } from '../src/types/index.js'

function createScenario(steps: unknown[]): ScenarioDefinition {
	return {
		version: 1,
		id: 'scenario_validation_test',
		metadata: { name: 'Scenario Validation Test' },
		steps: steps as ScenarioDefinition['steps']
	}
}

describe('ScenarioManager.validateScenario', () => {
	it('rejects dispatch steps missing dispatch object', () => {
		const session = new Session({ name: 'scenario-validation-dispatch-missing' })
		const scenario = createScenario([{ type: 'dispatch' }])

		expect(() => session.scenarioManager.load(scenario)).toThrow('steps[0].dispatch')
	})

	it('rejects dispatch steps missing dispatch.kind', () => {
		const session = new Session({ name: 'scenario-validation-dispatch-kind-missing' })
		const scenario = createScenario([{ type: 'dispatch', dispatch: { payload: {} } }])

		expect(() => session.scenarioManager.load(scenario)).toThrow('steps[0].dispatch.kind')
	})

	it('rejects wait steps missing wait object', () => {
		const session = new Session({ name: 'scenario-validation-wait-missing' })
		const scenario = createScenario([{ type: 'wait' }])

		expect(() => session.scenarioManager.load(scenario)).toThrow('steps[0].wait')
	})

	it('rejects wait steps with no condition fields', () => {
		const session = new Session({ name: 'scenario-validation-wait-empty' })
		const scenario = createScenario([{ type: 'wait', wait: {} }])

		expect(() => session.scenarioManager.load(scenario)).toThrow('Wait step must specify at least one condition')
	})

	it('rejects assert steps missing assert object', () => {
		const session = new Session({ name: 'scenario-validation-assert-missing' })
		const scenario = createScenario([{ type: 'assert' }])

		expect(() => session.scenarioManager.load(scenario)).toThrow('steps[0].assert')
	})

	it('rejects assert steps with no supported assertions', () => {
		const session = new Session({ name: 'scenario-validation-assert-empty' })
		const scenario = createScenario([{ type: 'assert', assert: {} }])

		expect(() => session.scenarioManager.load(scenario)).toThrow('supported assertion')
	})

	it('rejects assert steps that attempt to use custom assertions', () => {
		const session = new Session({ name: 'scenario-validation-assert-custom' })
		const scenario = createScenario([{ type: 'assert', assert: { custom: { expr: 'x' } } }])

		expect(() => session.scenarioManager.load(scenario)).toThrow('Custom assertions are not supported yet')
	})

	it('rejects interact steps missing customId', () => {
		const session = new Session({ name: 'scenario-validation-interact-customid-missing' })
		const scenario = createScenario([{ type: 'interact', interact: { componentType: 'button' } }])

		expect(() => session.scenarioManager.load(scenario)).toThrow('steps[0].interact.customId')
	})
})

