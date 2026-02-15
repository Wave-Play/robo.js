/**
 * Tests for SubscriptionRegistry: subscribe/unsubscribe, idempotency, scoping.
 */

import { SubscriptionRegistry } from '../../../src/activity/host/subscription-registry.js'

describe('SubscriptionRegistry', () => {
	let registry: SubscriptionRegistry

	beforeEach(() => {
		registry = new SubscriptionRegistry('test-instance-1')
	})

	test('subscribe new event returns true', () => {
		const result = registry.subscribe('VOICE_STATE_UPDATE')
		expect(result).toBe(true)
		expect(registry.size).toBe(1)
	})

	test('subscribe duplicate returns false (idempotent)', () => {
		registry.subscribe('VOICE_STATE_UPDATE')
		const result = registry.subscribe('VOICE_STATE_UPDATE')
		expect(result).toBe(false)
		expect(registry.size).toBe(1)
	})

	test('subscribe with different args creates separate subscriptions', () => {
		registry.subscribe('VOICE_STATE_UPDATE', { channel_id: '123' })
		registry.subscribe('VOICE_STATE_UPDATE', { channel_id: '456' })
		expect(registry.size).toBe(2)
	})

	test('unsubscribe existing returns true', () => {
		registry.subscribe('VOICE_STATE_UPDATE')
		const result = registry.unsubscribe('VOICE_STATE_UPDATE')
		expect(result).toBe(true)
		expect(registry.size).toBe(0)
	})

	test('unsubscribe non-existing returns false (idempotent)', () => {
		const result = registry.unsubscribe('VOICE_STATE_UPDATE')
		expect(result).toBe(false)
	})

	test('isSubscribed returns true when subscribed', () => {
		registry.subscribe('VOICE_STATE_UPDATE')
		expect(registry.isSubscribed('VOICE_STATE_UPDATE')).toBe(true)
	})

	test('isSubscribed returns false when not subscribed', () => {
		expect(registry.isSubscribed('VOICE_STATE_UPDATE')).toBe(false)
	})

	test('isSubscribed with specific args checks exact match', () => {
		registry.subscribe('VOICE_STATE_UPDATE', { channel_id: '123' })
		expect(registry.isSubscribed('VOICE_STATE_UPDATE', { channel_id: '123' })).toBe(true)
		expect(registry.isSubscribed('VOICE_STATE_UPDATE', { channel_id: '456' })).toBe(false)
	})

	test('isSubscribed without args returns true if any subscription for event exists', () => {
		registry.subscribe('VOICE_STATE_UPDATE', { channel_id: '123' })
		expect(registry.isSubscribed('VOICE_STATE_UPDATE')).toBe(true)
	})

	test('getSubscriptionsForEvent returns correct entries', () => {
		registry.subscribe('VOICE_STATE_UPDATE', { channel_id: '123' })
		registry.subscribe('VOICE_STATE_UPDATE', { channel_id: '456' })
		registry.subscribe('SPEAKING_START')

		const subs = registry.getSubscriptionsForEvent('VOICE_STATE_UPDATE')
		expect(subs).toHaveLength(2)
		expect(subs.every((s) => s.event_name === 'VOICE_STATE_UPDATE')).toBe(true)
	})

	test('getAll returns all subscriptions', () => {
		registry.subscribe('VOICE_STATE_UPDATE')
		registry.subscribe('SPEAKING_START')
		registry.subscribe('ACTIVITY_LAYOUT_MODE_UPDATE')

		expect(registry.getAll()).toHaveLength(3)
	})

	test('clear removes all subscriptions', () => {
		registry.subscribe('VOICE_STATE_UPDATE')
		registry.subscribe('SPEAKING_START')
		registry.clear()

		expect(registry.size).toBe(0)
		expect(registry.getAll()).toHaveLength(0)
	})

	test('size returns correct count', () => {
		expect(registry.size).toBe(0)
		registry.subscribe('A')
		expect(registry.size).toBe(1)
		registry.subscribe('B')
		expect(registry.size).toBe(2)
		registry.unsubscribe('A')
		expect(registry.size).toBe(1)
	})

	test('key stability: same event+args produces same key', () => {
		// Subscribe, unsubscribe, subscribe again -- should work the same
		registry.subscribe('VOICE_STATE_UPDATE', { channel_id: '123', guild_id: '456' })
		expect(registry.size).toBe(1)
		registry.unsubscribe('VOICE_STATE_UPDATE', { channel_id: '123', guild_id: '456' })
		expect(registry.size).toBe(0)

		// Resubscribe with same args (different order) should also work
		registry.subscribe('VOICE_STATE_UPDATE', { guild_id: '456', channel_id: '123' })
		expect(registry.size).toBe(1)
		// Unsubscribe with original order
		registry.unsubscribe('VOICE_STATE_UPDATE', { channel_id: '123', guild_id: '456' })
		expect(registry.size).toBe(0)
	})

	test('instance_id is set correctly', () => {
		expect(registry.instance_id).toBe('test-instance-1')
	})
})
