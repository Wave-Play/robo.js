import type { StageMessage } from '../types/stage'
import { isRenderableMessage } from './message'

export function sanitizeMessage(message: StageMessage): StageMessage | null {
	if (!message.author || !message.timestamp) {
		console.warn('[MessageValidator] Message missing author or timestamp:', message.id)
		return null
	}

	if (!isRenderableMessage(message)) {
		console.warn('[MessageValidator] Message has no renderable content:', message.id)
		return null
	}

	return message
}
