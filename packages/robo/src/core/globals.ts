import type { FlashcoreAdapter } from '../types/index.js'

const instanceId = Math.random().toString(36).slice(2)

export const Globals = {
	getFlashcoreAdapter: () => {
		if (!globalThis.robo) {
			Globals.init()
		}

		return globalThis.robo.flashcore._adapter
	},
	init: () => {
		globalThis.robo = {
			flashcore: {
				_adapter: null
			}
		}
	},
	instanceId,
	registerFlashcore: (adapter: FlashcoreAdapter) => {
		if (!globalThis.robo) {
			Globals.init()
		}

		globalThis.robo.flashcore._adapter = adapter
	}
}
