import { EventEmitter } from 'node:events'
import type { LevelUpEvent, LevelDownEvent, XPChangeEvent } from '~/types.js'

/**
 * Event name types for XP system events
 */
export type XPEventName = 'levelUp' | 'levelDown' | 'xpChange'

/**
 * Map of event names to their payload types
 */
export interface XPEventMap {
	levelUp: LevelUpEvent
	levelDown: LevelDownEvent
	xpChange: XPChangeEvent
}

/**
 * Singleton EventEmitter instance for XP events
 */
const emitter = new EventEmitter()
emitter.setMaxListeners(0) // Allow unlimited listeners

/**
 * Emits a level-up event when a user gains one or more levels.
 *
 * This event is emitted after XP has been persisted to Flashcore.
 * Other plugins can subscribe to this event to implement features like:
 * - Role rewards when reaching specific levels
 * - Level-up announcements in channels
 * - Achievement tracking
 *
 * @param event - The level-up event payload
 *
 * @example
 * ```typescript
 * emitLevelUp({
 *   guildId: '123456789',
 *   userId: '987654321',
 *   oldLevel: 4,
 *   newLevel: 5,
 *   totalXp: 310
 * })
 * ```
 */
export function emitLevelUp(event: LevelUpEvent): void {
	emitter.emit('levelUp', event)
}

/**
 * Emits a level-down event when a user loses one or more levels.
 *
 * This typically occurs when XP is removed (e.g., moderation actions).
 * This event is emitted after XP has been persisted to Flashcore.
 *
 * @param event - The level-down event payload
 *
 * @example
 * ```typescript
 * emitLevelDown({
 *   guildId: '123456789',
 *   userId: '987654321',
 *   oldLevel: 5,
 *   newLevel: 4,
 *   totalXp: 250
 * })
 * ```
 */
export function emitLevelDown(event: LevelDownEvent): void {
	emitter.emit('levelDown', event)
}

/**
 * Emits an XP change event whenever a user's XP is modified.
 *
 * This event is emitted for all XP changes (awards, removals, sets).
 * This event is emitted after XP has been persisted to Flashcore.
 *
 * @param event - The XP change event payload
 *
 * @example
 * ```typescript
 * emitXPChange({
 *   guildId: '123456789',
 *   userId: '987654321',
 *   oldXp: 100,
 *   newXp: 120,
 *   delta: 20,
 *   reason: 'message'
 * })
 * ```
 */
export function emitXPChange(event: XPChangeEvent): void {
	emitter.emit('xpChange', event)
}

/**
 * Registers a persistent event listener for XP events.
 *
 * The listener will be invoked every time the specified event is emitted.
 * Use this for ongoing monitoring of XP events.
 *
 * @param event - The event name to listen for
 * @param listener - The callback function to invoke when the event is emitted
 *
 * @example
 * ```typescript
 * import { events } from '@robojs/xp'
 *
 * // Listen for level-ups
 * events.on('levelUp', (event) => {
 *   console.log(`User ${event.userId} reached level ${event.newLevel}!`)
 * })
 *
 * // Listen for XP changes
 * events.on('xpChange', (event) => {
 *   console.log(`User ${event.userId} gained ${event.delta} XP`)
 * })
 * ```
 */
export function on<T extends XPEventName>(event: T, listener: (payload: XPEventMap[T]) => void): void {
	emitter.on(event, listener)
}

/**
 * Registers a one-time event listener for XP events.
 *
 * The listener will be invoked only once when the event is emitted,
 * then automatically removed.
 *
 * @param event - The event name to listen for
 * @param listener - The callback function to invoke when the event is emitted
 *
 * @example
 * ```typescript
 * import { events } from '@robojs/xp'
 *
 * // Listen for next level-up only
 * events.once('levelUp', (event) => {
 *   console.log(`First level-up: ${event.userId} reached level ${event.newLevel}`)
 * })
 * ```
 */
export function once<T extends XPEventName>(event: T, listener: (payload: XPEventMap[T]) => void): void {
	emitter.once(event, listener)
}

/**
 * Removes a previously registered event listener.
 *
 * The listener function reference must match the one passed to `on()` or `once()`.
 *
 * @param event - The event name to remove the listener from
 * @param listener - The callback function to remove
 *
 * @example
 * ```typescript
 * import { events } from '@robojs/xp'
 *
 * const handleLevelUp = (event) => {
 *   console.log(`Level up: ${event.newLevel}`)
 * }
 *
 * events.on('levelUp', handleLevelUp)
 * // Later...
 * events.off('levelUp', handleLevelUp)
 * ```
 */
export function off<T extends XPEventName>(event: T, listener: (payload: XPEventMap[T]) => void): void {
	emitter.off(event, listener)
}

/**
 * Internal function to access the raw EventEmitter instance.
 *
 * This is primarily for testing purposes and should not be used
 * in production code. Use the typed event functions instead.
 *
 * @internal
 */
export function _getEmitter(): EventEmitter {
	return emitter
}
