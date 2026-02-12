/**
 * Unit tests for ScenarioRunner + simulation plumbing
 * Covers metadata propagation, stepping, assertions, and snapshots.
 */

import { Session } from '../src/session/session.js'
import type { ScenarioDefinition } from '../src/types/index.js'

function createScenario(steps: ScenarioDefinition['steps']): ScenarioDefinition {
	return {
		version: 1,
		id: 'scenario_test',
		metadata: { name: 'Scenario Test' },
		steps
	}
}

describe('ScenarioRunner', () => {
	it('step() pauses between steps and completes at the end', async () => {
		const session = new Session({ name: 'scenario-runner-step' })
		const scenario = createScenario([
			{ type: 'wait', wait: { duration: 0 } },
			{ type: 'wait', wait: { duration: 0 } }
		])

		session.scenarioManager.load(scenario)
		const runner = session.scenarioManager.getRunner()

		const first = await runner.step()
		expect(first.state.status).toBe('paused')
		expect(first.state.currentStepIndex).toBe(1)

		const second = await runner.step()
		expect(second.state.status).toBe('completed')
		expect(second.state.currentStepIndex).toBe(2)
	})

	it('propagates metadata and triggeredBy from dispatch to bot outputs', async () => {
		const session = new Session({ name: 'scenario-runner-metadata' })
		const channel = session.state.channels.values().next().value
		expect(channel).toBeDefined()
		const channelId = channel!.id

		const scenario = createScenario([
			{
				type: 'dispatch',
				expectedNodeId: 'node_dispatch',
				dispatch: {
					kind: 'message_create',
					channelId,
					payload: {
						channel_id: channelId,
						content: 'ping'
					}
				}
			}
		])

		session.scenarioManager.load(scenario)
		const runState = session.scenarioManager.getRunState()
		const runner = session.scenarioManager.getRunner()

		// Simulate a bot output while the dispatch step action context is still active.
		const stepPromise = runner.step()
		setTimeout(() => {
			session.recordAction('message_sent', {
				id: 'msg_1',
				channel_id: channelId,
				content: 'pong'
			})
		}, 50)

		const { state, stepResult } = await stepPromise
		expect(state.status).toBe('completed')
		expect(stepResult).toBeDefined()

		const actions = session.recorder.getAll()
		const dispatchAction = actions.find((a) => a.type === 'dispatch')
		const outputAction = actions.find((a) => a.type === 'message_sent')

		expect(dispatchAction).toBeDefined()
		expect(outputAction).toBeDefined()

		expect(dispatchAction!.metadata).toMatchObject({
			scenarioId: scenario.id,
			runId: runState.runId,
			stepIndex: 0,
			nodeId: 'node_dispatch'
		})

		expect(outputAction!.metadata).toMatchObject({
			scenarioId: scenario.id,
			runId: runState.runId,
			stepIndex: 0,
			nodeId: 'node_dispatch'
		})

		expect(outputAction!.triggeredBy).toBe(dispatchAction!.id)
		expect(stepResult!.recordedActionIds).toEqual(expect.arrayContaining([dispatchAction!.id, outputAction!.id]))
	})

	it('assert steps can validate outputs from prior steps', async () => {
		const session = new Session({ name: 'scenario-runner-assert' })
		const channel = session.state.channels.values().next().value
		expect(channel).toBeDefined()
		const channelId = channel!.id

		const scenario = createScenario([
			{
				type: 'dispatch',
				expectedNodeId: 'node_dispatch',
				dispatch: {
					kind: 'message_create',
					channelId,
					payload: {
						channel_id: channelId,
						content: 'ping'
					}
				}
			},
			{
				type: 'assert',
				expectedNodeId: 'node_assert',
				assert: { actionRecorded: 'message_sent' }
			}
		])

		session.scenarioManager.load(scenario)
		const runner = session.scenarioManager.getRunner()

		const step0Promise = runner.step()
		setTimeout(() => {
			session.recordAction('message_sent', {
				id: 'msg_1',
				channel_id: channelId,
				content: 'pong'
			})
		}, 50)

		const step0 = await step0Promise
		expect(step0.state.status).toBe('paused')
		expect(step0.state.currentStepIndex).toBe(1)

		const step1 = await runner.step()
		expect(step1.stepResult?.status).toBe('ok')
		expect(step1.state.status).toBe('completed')
	})

	it('halts in failed status on step failure and remains failed when finishing with failures', async () => {
		const session = new Session({ name: 'scenario-runner-failed' })

		const scenario = createScenario([
			{
				type: 'assert',
				expectedNodeId: 'node_assert',
				assert: { actionRecorded: 'message_sent' }
			},
			{ type: 'wait', wait: { duration: 0 } }
		])

		session.scenarioManager.load(scenario)
		const runner = session.scenarioManager.getRunner()

		const step0 = await runner.step()
		expect(step0.stepResult?.status).toBe('failed')
		expect(step0.state.status).toBe('failed')
		expect(step0.state.currentStepIndex).toBe(1)

		const step1 = await runner.step()
		expect(step1.stepResult?.status).toBe('ok')
		expect(step1.state.status).toBe('failed')
		expect(step1.state.currentStepIndex).toBe(2)
		expect(step1.state.hasFailures).toBe(true)
		expect(step1.state.endedAt).toBeDefined()
	})

	it('allows stop() from failed status before the run is finished', async () => {
		const session = new Session({ name: 'scenario-runner-stop-from-failed' })

		const scenario = createScenario([
			{
				type: 'assert',
				assert: { actionRecorded: 'message_sent' }
			},
			{ type: 'wait', wait: { duration: 0 } }
		])

		session.scenarioManager.load(scenario)
		const runner = session.scenarioManager.getRunner()

		const step0 = await runner.step()
		expect(step0.state.status).toBe('failed')
		expect(step0.state.currentStepIndex).toBe(1)

		const stopped = runner.stop()
		expect(stopped.status).toBe('stopped')
		expect(stopped.endedAt).toBeDefined()
	})

	it('resume() continues running from failed status', async () => {
		const session = new Session({ name: 'scenario-runner-resume-from-failed' })
		const scenario = createScenario([
			{
				type: 'assert',
				assert: { actionRecorded: 'message_sent' }
			},
			{ type: 'wait', wait: { duration: 0 } }
		])

		session.scenarioManager.load(scenario)
		const runner = session.scenarioManager.getRunner()

		const step0 = await runner.step()
		expect(step0.state.status).toBe('failed')
		expect(step0.state.currentStepIndex).toBe(1)

		await runner.resume()

		// runLoop is async; wait briefly for the second step to execute.
		for (let i = 0; i < 50; i++) {
			const state = session.scenarioManager.getRunState()
			if (state.currentStepIndex === 2 && state.endedAt) {
				expect(state.status).toBe('failed')
				return
			}
			await new Promise((r) => setTimeout(r, 10))
		}

		throw new Error('Timed out waiting for resume() to complete remaining steps')
	})

	it('marks ended when the final step fails (no resume/stop needed)', async () => {
		const session = new Session({ name: 'scenario-runner-final-step-failed' })

		const scenario = createScenario([
			{
				type: 'assert',
				assert: { actionRecorded: 'message_sent' }
			}
		])

		session.scenarioManager.load(scenario)
		const runner = session.scenarioManager.getRunner()

		const step0 = await runner.step()
		expect(step0.stepResult?.status).toBe('failed')
		expect(step0.state.status).toBe('failed')
		expect(step0.state.currentStepIndex).toBe(1)
		expect(step0.state.totalSteps).toBe(1)
		expect(step0.state.endedAt).toBeDefined()

		await expect(runner.resume()).rejects.toThrow('Cannot resume: scenario is already finished')
		expect(() => runner.stop()).toThrow('Cannot stop: scenario is already finished')
	})
})
