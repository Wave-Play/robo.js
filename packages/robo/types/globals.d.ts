/* eslint-disable no-var */
import type { FlashcoreAdapter } from '../types/index.js'

declare global {
	var robo: {
		flashcore: {
			_adapter: FlashcoreAdapter
		}
	}
}

export {}
