import { isReplyingToUser } from '@/core/ai.js'
import { logger } from '@/core/logger.js'
import { client } from 'robo.js'
import type { Message, Typing } from 'discord.js'

// 10 seconds emulates Discord's typing indicator timeout
const DEBOUNCE_TIME = 10_000

// Never wait longer than 1 second in case the message was sent
const DEBOUNCE_MAX = 1_000

/**
 * When a user currently being replied to starts typing, delay the reply.
 * This allows us to have a more natural conversation flow and better context.
 */
export default (event: Typing) => {
	const { user } = event

	// Don't debounce for self
	if (user.id === client.user?.id) {
		return
	}

	// Don't do anything unless currently replying to a user
	if (!isReplyingToUser(user.id)) {
		logger.debug(`User @${user.username} started typing but not currently replying`)
		return
	}
	logger.debug(`User @${user.username} started typing`)

	// Clear any existing debounce
	const state = UserStatus[event.user.id]
	if (state?.debounce) {
		clearTimeout(state.debounce)
	}

	// If not already typing, assume new context
	if (state && !state.activities?.has('typing')) {
		state.context = []
	}

	// Set a new debounce
	const debounce = setTimeout(() => {
		clearTimeout(debounce)
		clearUserTyping(event.user.id)
	}, DEBOUNCE_TIME + 100)

	// Update user state
	if (state) {
		state.activities.add('typing')
		state.debounce = debounce
		state.lastTypedAt = Date.now()
		return
	} else {
		UserStatus[event.user.id] = {
			activities: new Set<'speaking' | 'typing'>().add('typing'),
			context: [],
			debounce: debounce,
			lastTypedAt: Date.now()
		}
	}
}

interface UserState {
	activities: Set<'speaking' | 'typing'>
	context: string[]
	debounce: NodeJS.Timeout
	lastTypedAt: number
}
const UserStatus: Record<string, UserState> = {}

export function addUserFollowUp(userId: string, message: Message, messageContent: string) {
	const state = UserStatus[userId]

	// Don't add follow-ups if the user isn't typing
	if (!state?.activities?.has('typing')) {
		logger.debug(`User @${userId} isn't typing, can't add follow-up`)
		return
	}

	// Add the message to the user's context
	state.context.push(message.author.username + ': ' + messageContent)
	clearUserTyping(userId)
}

export function clearUserTyping(userId: string) {
	const state = UserStatus[userId]
	if (!state) {
		return
	}

	clearTimeout(state.debounce)
	state.activities.delete('typing')
	logger.debug(`Cleared typing state for @${userId}`)
}

export function isUserTyping(userId: string) {
	const state = UserStatus[userId]

	// No state means the user isn't typing
	if (!state) {
		return false
	}

	// No active typing means the user isn't typing
	if (!state.activities.has('typing')) {
		return false
	}

	// Not having typed in a while means the user isn't typing
	if (Date.now() - state.lastTypedAt > DEBOUNCE_TIME) {
		return false
	}

	return true
}

export function waitForTyping(userId: string) {
	return new Promise<string[]>((resolve) => {
		const run = async () => {
			// Loop until the user stops typing
			while (isUserTyping(userId)) {
				const state = UserStatus[userId]

				// Delay by the remaining debounce time (up to max in case message was sent)
				const remaining = Math.min(DEBOUNCE_TIME - (Date.now() - state.lastTypedAt), DEBOUNCE_MAX)
				logger.debug(`Waiting for user @${userId} to stop typing (${remaining}ms)`)
				await new Promise((resolve) => setTimeout(resolve, remaining))
			}

			// Resolve with the user's context (while clearing for next time)
			const state = UserStatus[userId]
			const context = state?.context ?? []
			if (state) {
				state.context = []
				clearUserTyping(userId)
			}
			logger.debug(`User @${userId} stopped typing. Context:`, context)
			resolve(context)
		}
		run()
	})
}
