/**
 * RuntimeProvider abstraction for accessing Robo state and Flashcore
 * across dev mode (Spirit IPC) and start mode (direct imports).
 */

import type { Spirits } from './spirits.js'

export interface RuntimeProvider {
	getState(): Promise<Record<string, unknown> | null>
	getStateValue(key: string): Promise<unknown | null>
	setStateValue(key: string, value: unknown): Promise<boolean>
	deleteStateKey(key: string): Promise<boolean>
	getStateForks(): Promise<string[] | null>
	flashcoreGet(key: string): Promise<unknown>
	flashcoreSet(key: string, value: unknown): Promise<boolean>
	flashcoreDelete(key: string): Promise<boolean>
	flashcoreHas(key: string): Promise<boolean>
	isRunning(): boolean
}

/**
 * Creates a RuntimeProvider for dev mode.
 * State operations go through Spirit IPC; Flashcore is directly accessible
 * since it's initialized in the CLI process.
 *
 * Both `getSpirits` and `getSpiritId` are getters so the provider tracks
 * the mutable values across restarts and deferred initialization.
 */
export function createDevProvider(
	getSpirits: () => Spirits | undefined,
	getSpiritId: () => string | null | undefined
): RuntimeProvider {
	return {
		async getState() {
			const spirits = getSpirits()
			const spiritId = getSpiritId()
			if (!spirits || !spiritId) return null

			try {
				return await spirits.exec<Record<string, unknown>>(spiritId, { event: 'get-state' })
			} catch {
				return null
			}
		},

		async getStateValue(key: string) {
			const state = await this.getState()
			if (!state) return null

			return state[key] ?? null
		},

		async setStateValue(key: string, value: unknown) {
			const spirits = getSpirits()
			const spiritId = getSpiritId()
			if (!spirits || !spiritId) return false

			try {
				await spirits.exec(spiritId, {
					event: 'cli-state-set',
					payload: { key, value }
				})
				return true
			} catch {
				return false
			}
		},

		async deleteStateKey(key: string) {
			const spirits = getSpirits()
			const spiritId = getSpiritId()
			if (!spirits || !spiritId) return false

			try {
				await spirits.exec(spiritId, {
					event: 'cli-state-delete',
					payload: { key }
				})
				return true
			} catch {
				return false
			}
		},

		async getStateForks() {
			const spirits = getSpirits()
			const spiritId = getSpiritId()
			if (!spirits || !spiritId) return null

			try {
				return await spirits.exec<string[]>(spiritId, {
					event: 'cli-state-forks'
				})
			} catch {
				return null
			}
		},

		async flashcoreGet(key: string) {
			const { Flashcore } = await import('../../core/flashcore.js')
			return Flashcore.get(key)
		},

		async flashcoreSet(key: string, value: unknown) {
			const { Flashcore } = await import('../../core/flashcore.js')
			return !!(await Flashcore.set(key, value))
		},

		async flashcoreDelete(key: string) {
			const { Flashcore } = await import('../../core/flashcore.js')
			return !!(await Flashcore.delete(key))
		},

		async flashcoreHas(key: string) {
			const { Flashcore } = await import('../../core/flashcore.js')
			return Flashcore.has(key)
		},

		isRunning() {
			const spirits = getSpirits()
			const spiritId = getSpiritId()
			if (!spirits || !spiritId) return false

			const spirit = spirits.get(spiritId)
			return spirit != null && !spirit.isTerminated
		}
	}
}