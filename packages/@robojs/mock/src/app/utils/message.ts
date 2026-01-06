import type { StageMessage } from '../types/stage'

const COMPONENTS_V2_FLAG = 1 << 15
const SYSTEM_MESSAGE_TYPES = new Set([7])

function hasRenderableComponents(components: unknown[] | undefined, flags?: number): boolean {
	if (!components || components.length === 0) {
		return false
	}

	if (((flags ?? 0) & COMPONENTS_V2_FLAG) !== 0) {
		return true
	}

	return components.some((component) => {
		if (typeof component !== 'object' || component === null) {
			return false
		}
		const type = (component as { type?: number }).type
		return type === 1
	})
}

export function isRenderableMessage(message: StageMessage): boolean {
	if (message.type !== undefined && SYSTEM_MESSAGE_TYPES.has(message.type)) {
		return true
	}

	if (message.content && message.content.trim().length > 0) {
		return true
	}

	if (message.embeds && message.embeds.length > 0) {
		return true
	}

	if (message.attachments && message.attachments.length > 0) {
		return true
	}

	if (hasRenderableComponents(message.components, message.flags)) {
		return true
	}

	if (message.interaction_metadata?.user || message.interaction?.user) {
		return true
	}

	return false
}
