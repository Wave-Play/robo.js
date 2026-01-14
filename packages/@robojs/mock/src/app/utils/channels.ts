import type { StageChannel } from '../types/stage'

export const CHANNEL_TYPE = {
	TEXT: 0,
	VOICE: 2,
	THREAD_PUBLIC: 11,
	THREAD_PRIVATE: 12,
	FORUM: 15
} as const

/**
 * Generate a lightweight snowflake-like ID suitable for mock UI entities.
 */
export function createLocalId(prefix = 'chan'): string {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Normalize user input into a Discord-like channel slug.
 * Lowercases, strips invalid chars, and collapses separators.
 */
export function normalizeChannelName(input: string): string {
	const trimmed = input.trim().toLowerCase()
	const cleaned = trimmed
		.replace(/[^a-z0-9-\s_]/g, '')
		.replace(/[\s_]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '')

	return cleaned || 'new-channel'
}

/**
 * Default metadata for new thread-style channels.
 */
export function buildThreadMetadata(): NonNullable<StageChannel['thread_metadata']> {
	return {
		archived: false,
		auto_archive_duration: 1440,
		archive_timestamp: new Date().toISOString(),
		locked: false
	}
}
