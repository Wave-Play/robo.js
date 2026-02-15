import { getActivityHostManager } from './activity-host-manager.js'
import { buildEventDispatch } from './rpc-envelope.js'

// ============================================================================
// Coalescing State
// ============================================================================

/** Per-session debounce timers for ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE */
const participantsCoalesceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

// ============================================================================
// Voice Signals
// ============================================================================

/**
 * Called when voice state changes in a session (join/leave/mute/deaf/speaking).
 * Emits:
 * - SPEAKING_START / SPEAKING_STOP (if subscribed, when speaking field changes)
 *
 * Note: ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE is handled separately via
 * scheduleParticipantsUpdate() for coalescing (spec section 14.3).
 *
 * @param sessionId - Mock session ID
 * @param userId - The user whose voice state changed
 * @param channelId - The voice channel that was affected (may be null for leave)
 * @param previousSpeaking - Previous speaking state (for delta detection)
 * @param currentSpeaking - Current speaking state
 * @returns Array of outbound speaking event messages to forward to Activity iframe
 */
export function onVoiceStateChanged(
	sessionId: string,
	userId: string,
	channelId: string | null,
	previousSpeaking?: boolean,
	currentSpeaking?: boolean
): unknown[] {
	const hostManager = getActivityHostManager()
	const record = hostManager.getRecord(sessionId)
	if (!record || !record.ready_emitted) return []

	const subs = hostManager.getSubscriptions(record.instance_id)
	if (!subs) return []

	const outbound: unknown[] = []

	// SPEAKING_START / SPEAKING_STOP
	// Spec section 8.2: emitted when a user starts/stops speaking
	// Subscription is scoped by channel_id in args
	if (channelId && previousSpeaking !== currentSpeaking) {
		if (currentSpeaking === true) {
			const startSubs = subs.getSubscriptionsForEvent('SPEAKING_START')
			for (const sub of startSubs) {
				const scopedChannelId = sub.args.channel_id as string | undefined
				if (!scopedChannelId || scopedChannelId === channelId) {
					outbound.push(buildEventDispatch('SPEAKING_START', {
						user_id: userId,
						channel_id: channelId
					}))
					break // One emission per event per change
				}
			}
		} else if (currentSpeaking === false && previousSpeaking === true) {
			const stopSubs = subs.getSubscriptionsForEvent('SPEAKING_STOP')
			for (const sub of stopSubs) {
				const scopedChannelId = sub.args.channel_id as string | undefined
				if (!scopedChannelId || scopedChannelId === channelId) {
					outbound.push(buildEventDispatch('SPEAKING_STOP', {
						user_id: userId,
						channel_id: channelId
					}))
					break
				}
			}
		}
	}

	// VOICE_STATE_UPDATE
	// Scoped by channel_id in subscribe args. Payload schema is UserVoiceState.
	if (channelId) {
		const voiceSubs = subs.getSubscriptionsForEvent('VOICE_STATE_UPDATE')
		for (const sub of voiceSubs) {
			const scopedChannelId = sub.args.channel_id as string | undefined
			if (!scopedChannelId || scopedChannelId === channelId) {
				const snapshot = hostManager.getSnapshotForEvent('VOICE_STATE_UPDATE', record)
				if (Array.isArray(snapshot)) {
					const match = snapshot.find((s) => {
						const payload = s as { user?: { id?: string } }
						return payload.user?.id === userId
					})
					if (match) {
						outbound.push(buildEventDispatch('VOICE_STATE_UPDATE', match))
					}
				}
				break
			}
		}
	}

	return outbound
}

// ============================================================================
// Platform Signals
// ============================================================================

/**
 * Called when platform state changes for an Activity session.
 * Emits the corresponding event if the Activity is subscribed.
 *
 * @param sessionId - Mock session ID
 * @param changedField - Which field changed ('layout_mode' | 'orientation' | 'thermal_state')
 * @param newValue - The new value for the field
 * @returns Array of outbound event messages
 */
export function onPlatformStateChanged(
	sessionId: string,
	changedField: 'layout_mode' | 'orientation' | 'thermal_state',
	newValue: unknown
): unknown[] {
	const hostManager = getActivityHostManager()
	const record = hostManager.getRecord(sessionId)
	if (!record || !record.ready_emitted) return []

	const subs = hostManager.getSubscriptions(record.instance_id)
	if (!subs) return []

	const outbound: unknown[] = []

	switch (changedField) {
		case 'layout_mode': {
			if (subs.isSubscribed('ACTIVITY_LAYOUT_MODE_UPDATE')) {
				outbound.push(buildEventDispatch('ACTIVITY_LAYOUT_MODE_UPDATE', {
					layout_mode: newValue
				}))
			}
			break
		}
		case 'orientation': {
			if (subs.isSubscribed('ORIENTATION_UPDATE')) {
				outbound.push(buildEventDispatch('ORIENTATION_UPDATE', newValue))
			}
			break
		}
		case 'thermal_state': {
			if (subs.isSubscribed('THERMAL_STATE_UPDATE')) {
				outbound.push(buildEventDispatch('THERMAL_STATE_UPDATE', {
					thermal_state: newValue
				}))
			}
			break
		}
	}

	return outbound
}

// ============================================================================
// Relationship Signals
// ============================================================================

/**
 * Called when relationship state changes for an Activity session.
 * Emits RELATIONSHIP_UPDATE for each changed relationship if subscribed.
 *
 * @param sessionId - Mock session ID
 * @param changedRelationships - Relationships that changed (delta)
 * @returns Array of outbound event messages
 */
export function onRelationshipStateChanged(
	sessionId: string,
	changedRelationships: Array<{
		id: string
		type: number
		user: { id: string; username: string; discriminator: string; avatar: string | null; global_name?: string | null }
		presence?: { status: string; activities?: Array<{ name: string; type: number }> }
	}>
): unknown[] {
	const hostManager = getActivityHostManager()
	const record = hostManager.getRecord(sessionId)
	if (!record || !record.ready_emitted) return []

	const subs = hostManager.getSubscriptions(record.instance_id)
	if (!subs || !subs.isSubscribed('RELATIONSHIP_UPDATE')) return []

	const outbound: unknown[] = []
	for (const rel of changedRelationships) {
		outbound.push(buildEventDispatch('RELATIONSHIP_UPDATE', rel))
	}

	return outbound
}

// ============================================================================
// Quest Signals
// ============================================================================

/**
 * Called when quest state changes for an Activity session.
 * Emits QUEST_ENROLLMENT_STATUS_UPDATE for each changed quest if subscribed.
 *
 * @param sessionId - Mock session ID
 * @param questId - The quest that changed
 * @param enrollmentStatus - The updated enrollment status
 * @returns Array of outbound event messages
 */
export function onQuestStateChanged(
	sessionId: string,
	questId: string,
	enrollmentStatus: unknown
): unknown[] {
	const hostManager = getActivityHostManager()
	const record = hostManager.getRecord(sessionId)
	if (!record || !record.ready_emitted) return []

	const subs = hostManager.getSubscriptions(record.instance_id)
	if (!subs || !subs.isSubscribed('QUEST_ENROLLMENT_STATUS_UPDATE')) return []

	return [
		buildEventDispatch('QUEST_ENROLLMENT_STATUS_UPDATE', {
			quest_id: questId,
			enrollment_status: enrollmentStatus
		})
	]
}

// ============================================================================
// Coalescing (spec section 14.3)
// ============================================================================

/**
 * Schedule a coalesced ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE emission.
 * Multiple rapid voice state changes will be collapsed into a single event
 * within a 50ms window (spec section 14.3).
 *
 * @param sessionId - Mock session ID
 * @param emitCallback - Function to call with outbound messages
 */
export function scheduleParticipantsUpdate(
	sessionId: string,
	emitCallback: (messages: unknown[]) => void
): void {
	// If already scheduled, skip (will pick up latest state when timer fires)
	if (participantsCoalesceTimers.has(sessionId)) return

	const timer = setTimeout(() => {
		participantsCoalesceTimers.delete(sessionId)

		const hostManager = getActivityHostManager()
		const record = hostManager.getRecord(sessionId)
		if (!record || !record.ready_emitted) return

		const subs = hostManager.getSubscriptions(record.instance_id)
		if (!subs || !subs.isSubscribed('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE')) return

		const snapshot = hostManager.getSnapshotForEvent('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', record)
		if (snapshot) {
			emitCallback([buildEventDispatch('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', snapshot)])
		}
	}, 50)
	// Don't keep the Node process alive solely for coalescing timers (test friendliness)
	timer.unref?.()

	participantsCoalesceTimers.set(sessionId, timer)
}

/**
 * Cancel any pending coalesced update for a session (cleanup on close).
 */
export function cancelCoalesceTimers(sessionId: string): void {
	const timer = participantsCoalesceTimers.get(sessionId)
	if (timer) {
		clearTimeout(timer)
		participantsCoalesceTimers.delete(sessionId)
	}
}
