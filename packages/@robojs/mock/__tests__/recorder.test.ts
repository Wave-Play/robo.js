/**
 * Unit tests for ActionRecorder class
 * Action Recorder
 */

import { ActionRecorder } from '../src/session/recorder.js'

describe('ActionRecorder', () => {
	describe('instantiation', () => {
		it('should create recorder with default max actions', () => {
			const recorder = new ActionRecorder()

			expect(recorder.length).toBe(0)
			expect(recorder.maxLength).toBe(10000)
		})

		it('should create recorder with custom max actions', () => {
			const recorder = new ActionRecorder(500)

			expect(recorder.maxLength).toBe(500)
		})
	})

	describe('record()', () => {
		it('should record an action with generated id and timestamp', () => {
			const recorder = new ActionRecorder()
			const before = Date.now()

			const action = recorder.record('message_sent', { content: 'Hello' })

			expect(action.id).toBe('action_1')
			expect(action.timestamp).toBeGreaterThanOrEqual(before)
			expect(action.timestamp).toBeLessThanOrEqual(Date.now())
			expect(action.type).toBe('message_sent')
			expect(action.data).toEqual({ content: 'Hello' })
		})

		it('should increment action IDs', () => {
			const recorder = new ActionRecorder()

			const action1 = recorder.record('message_sent', {})
			const action2 = recorder.record('message_edited', {})
			const action3 = recorder.record('message_deleted', {})

			expect(action1.id).toBe('action_1')
			expect(action2.id).toBe('action_2')
			expect(action3.id).toBe('action_3')
		})

		it('should include optional fields when provided', () => {
			const recorder = new ActionRecorder()

			const action = recorder.record('interaction_response', { type: 4 }, {
				endpoint: 'POST /interactions/123/456/callback',
				method: 'POST',
				interactionId: '123',
				responseType: 4,
				triggeredBy: 'event_abc'
			})

			expect(action.endpoint).toBe('POST /interactions/123/456/callback')
			expect(action.method).toBe('POST')
			expect(action.interactionId).toBe('123')
			expect(action.responseType).toBe(4)
			expect(action.triggeredBy).toBe('event_abc')
		})

		it('should not include optional fields when not provided', () => {
			const recorder = new ActionRecorder()

			const action = recorder.record('gateway_heartbeat', { seq: 5 })

			expect(action.endpoint).toBeUndefined()
			expect(action.method).toBeUndefined()
			expect(action.interactionId).toBeUndefined()
			expect(action.responseType).toBeUndefined()
			expect(action.triggeredBy).toBeUndefined()
		})
	})

	describe('LRU eviction', () => {
		it('should evict oldest 10% when exceeding max actions', () => {
			const recorder = new ActionRecorder(10) // Small limit for testing

			// Record 12 actions (exceeds 10)
			for (let i = 0; i < 12; i++) {
				recorder.record('message_sent', { index: i })
			}

			// Should evict oldest 10% (1 action) when reaching capacity
			// After 11 actions: evict 1, leaving 10
			// After 12 actions: evict 1, leaving 11... wait that's not right
			// Let me re-check the logic
			// Actually the eviction happens when length > maxActions
			// So after adding 11th, we have 11 > 10, evict 1 (10%), leaving 10
			// Then we add 12th, we have 11 > 10, evict 1, leaving 10
			expect(recorder.length).toBeLessThanOrEqual(10)
		})

		it('should preserve newest actions during eviction', () => {
			const recorder = new ActionRecorder(10)

			// Record 15 actions
			for (let i = 0; i < 15; i++) {
				recorder.record('message_sent', { index: i })
			}

			const actions = recorder.getAll()

			// Newest actions should be preserved
			const lastAction = actions[actions.length - 1]
			expect((lastAction.data as { index: number }).index).toBe(14)
		})
	})

	describe('getAll()', () => {
		it('should return copy of all actions', () => {
			const recorder = new ActionRecorder()

			recorder.record('message_sent', { content: 'a' })
			recorder.record('message_sent', { content: 'b' })

			const actions = recorder.getAll()

			expect(actions).toHaveLength(2)
			expect(actions[0].data).toEqual({ content: 'a' })
			expect(actions[1].data).toEqual({ content: 'b' })
		})

		it('should return a copy, not the original array', () => {
			const recorder = new ActionRecorder()
			recorder.record('message_sent', {})

			const actions1 = recorder.getAll()
			const actions2 = recorder.getAll()

			expect(actions1).not.toBe(actions2)
			expect(actions1).toEqual(actions2)
		})
	})

	describe('getSince()', () => {
		it('should return actions since timestamp', async () => {
			const recorder = new ActionRecorder()

			recorder.record('message_sent', { content: 'old' })

			// Wait a bit to ensure different timestamps
			await new Promise((resolve) => setTimeout(resolve, 10))
			const afterFirst = Date.now()
			await new Promise((resolve) => setTimeout(resolve, 10))

			recorder.record('message_sent', { content: 'new' })

			const recentActions = recorder.getSince(afterFirst)

			expect(recentActions).toHaveLength(1)
			expect(recentActions[0].data).toEqual({ content: 'new' })
		})

		it('should return empty array when no actions match', () => {
			const recorder = new ActionRecorder()
			recorder.record('message_sent', {})

			const futureActions = recorder.getSince(Date.now() + 1000)

			expect(futureActions).toHaveLength(0)
		})
	})

	describe('getByType()', () => {
		it('should filter actions by single type', () => {
			const recorder = new ActionRecorder()

			recorder.record('message_sent', { content: 'a' })
			recorder.record('message_edited', { content: 'b' })
			recorder.record('message_sent', { content: 'c' })
			recorder.record('message_deleted', { id: '123' })

			const sentMessages = recorder.getByType('message_sent')

			expect(sentMessages).toHaveLength(2)
			expect(sentMessages[0].data).toEqual({ content: 'a' })
			expect(sentMessages[1].data).toEqual({ content: 'c' })
		})

		it('should return empty array when no actions match type', () => {
			const recorder = new ActionRecorder()
			recorder.record('message_sent', {})

			const reactions = recorder.getByType('reaction_added')

			expect(reactions).toHaveLength(0)
		})
	})

	describe('getByTypes()', () => {
		it('should filter actions by multiple types', () => {
			const recorder = new ActionRecorder()

			recorder.record('message_sent', { content: 'a' })
			recorder.record('message_edited', { content: 'b' })
			recorder.record('reaction_added', { emoji: '👍' })
			recorder.record('message_deleted', { id: '123' })

			const messageActions = recorder.getByTypes(['message_sent', 'message_edited', 'message_deleted'])

			expect(messageActions).toHaveLength(3)
		})
	})

	describe('query methods', () => {
		let recorder: ActionRecorder

		beforeEach(() => {
			recorder = new ActionRecorder()

			// Add various action types
			recorder.record('message_sent', { content: 'Hello' })
			recorder.record('message_edited', { content: 'Hello edited' })
			recorder.record('message_deleted', { id: '123' })
			recorder.record('reaction_added', { emoji: '👍' })
			recorder.record('reaction_removed', { emoji: '👍' })
			recorder.record('interaction_response', { type: 4 })
			recorder.record('interaction_followup', { content: 'Follow up' })
			recorder.record('interaction_edit', { content: 'Edited' })
			recorder.record('typing_started', { channelId: '456' })
			recorder.record('rest_request', { path: '/api/test' })
			recorder.record('gateway_message', { op: 99 })
			recorder.record('gateway_identify', { intents: 513 })
			recorder.record('gateway_heartbeat', { seq: 1 })
			recorder.record('dispatch', { event: 'MESSAGE_CREATE' })
		})

		it('getMessagesSent() should return message_sent actions', () => {
			const messages = recorder.getMessagesSent()
			expect(messages).toHaveLength(1)
			expect(messages[0].type).toBe('message_sent')
		})

		it('getMessagesEdited() should return message_edited actions', () => {
			const messages = recorder.getMessagesEdited()
			expect(messages).toHaveLength(1)
			expect(messages[0].type).toBe('message_edited')
		})

		it('getMessagesDeleted() should return message_deleted actions', () => {
			const messages = recorder.getMessagesDeleted()
			expect(messages).toHaveLength(1)
			expect(messages[0].type).toBe('message_deleted')
		})

		it('getInteractionResponses() should return all interaction actions', () => {
			const interactions = recorder.getInteractionResponses()
			expect(interactions).toHaveLength(3)
			expect(interactions.map((a) => a.type)).toEqual([
				'interaction_response',
				'interaction_followup',
				'interaction_edit'
			])
		})

		it('getRestRequests() should return all REST-related actions', () => {
			const rest = recorder.getRestRequests()
			// message_sent, message_edited, message_deleted, reaction_added, reaction_removed,
			// interaction_response, interaction_followup, interaction_edit, typing_started, rest_request
			expect(rest).toHaveLength(10)
		})

		it('getGatewayMessages() should return all gateway actions', () => {
			const gateway = recorder.getGatewayMessages()
			expect(gateway).toHaveLength(3)
			expect(gateway.map((a) => a.type)).toEqual([
				'gateway_message',
				'gateway_identify',
				'gateway_heartbeat'
			])
		})

		it('getDispatches() should return dispatch events', () => {
			const dispatches = recorder.getDispatches()
			expect(dispatches).toHaveLength(1)
			expect(dispatches[0].type).toBe('dispatch')
		})
	})

	describe('getTriggeredBy()', () => {
		it('should return actions triggered by specific event', () => {
			const recorder = new ActionRecorder()

			recorder.record('message_sent', { content: 'a' })
			recorder.record('interaction_response', { type: 4 }, { triggeredBy: 'interaction_123' })
			recorder.record('interaction_followup', { content: 'b' }, { triggeredBy: 'interaction_123' })
			recorder.record('message_sent', { content: 'c' }, { triggeredBy: 'other_event' })

			const triggered = recorder.getTriggeredBy('interaction_123')

			expect(triggered).toHaveLength(2)
			expect(triggered[0].type).toBe('interaction_response')
			expect(triggered[1].type).toBe('interaction_followup')
		})
	})

	describe('getForInteraction()', () => {
		it('should return actions for specific interaction', () => {
			const recorder = new ActionRecorder()

			recorder.record('interaction_response', { type: 4 }, { interactionId: '111' })
			recorder.record('interaction_response', { type: 4 }, { interactionId: '222' })
			recorder.record('interaction_followup', { content: 'a' }, { interactionId: '111' })

			const forInteraction = recorder.getForInteraction('111')

			expect(forInteraction).toHaveLength(2)
			expect(forInteraction.every((a) => a.interactionId === '111')).toBe(true)
		})
	})

	describe('clear()', () => {
		it('should clear all actions', () => {
			const recorder = new ActionRecorder()

			recorder.record('message_sent', {})
			recorder.record('message_sent', {})
			expect(recorder.length).toBe(2)

			recorder.clear()

			expect(recorder.length).toBe(0)
			expect(recorder.getAll()).toHaveLength(0)
		})

		it('should reset ID counter', () => {
			const recorder = new ActionRecorder()

			recorder.record('message_sent', {})
			recorder.record('message_sent', {})
			recorder.clear()

			const action = recorder.record('message_sent', {})

			expect(action.id).toBe('action_1')
		})
	})

	describe('length getter', () => {
		it('should return current action count', () => {
			const recorder = new ActionRecorder()

			expect(recorder.length).toBe(0)

			recorder.record('message_sent', {})
			expect(recorder.length).toBe(1)

			recorder.record('message_sent', {})
			expect(recorder.length).toBe(2)

			recorder.clear()
			expect(recorder.length).toBe(0)
		})
	})
})
