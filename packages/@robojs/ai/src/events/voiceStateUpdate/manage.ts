/** Handles Discord voice state updates, delegating to the voice manager with expected error guards. */
import { voiceManager } from '@/core/voice/index.js'
import { OptionalDependencyError } from '@/core/voice/deps.js'
import { TokenLimitError } from '@/core/token-ledger.js'
import type { VoiceState } from 'discord.js'

/**
 * Delegates voice state updates to the voice manager, suppressing expected optional dependency and
 * token limit errors while re-throwing unexpected failures.
 */
export default async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState) {
	try {
		// Delegate to voice manager for session lifecycle handling
		await voiceManager.handleVoiceStateUpdate(oldState, newState)
	} catch (error) {
		if (error instanceof OptionalDependencyError) {
			// Suppress errors from missing optional voice dependencies

			return
		}

		if (error instanceof TokenLimitError) {
			// Suppress errors from token usage limits

			return
		}

		// Re-throw unexpected errors
		throw error
	}
}
