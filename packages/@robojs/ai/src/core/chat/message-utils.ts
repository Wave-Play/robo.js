/** Utility helpers for formatting chat command names and arguments for display. */
import type { Command } from 'robo.js'

/**
 * Converts a command name into a readable display label by replacing separators, handling
 * camelCase, and normalizing whitespace.
 */
export function formatCommandDisplayName(name?: string): string {
	if (!name) {
		return 'request'
	}

	// Replace separators with spaces
	const spaced = name
		.replace(/[:._-]+/g, ' ')
		// Insert spaces before capital letters in camelCase
		.replace(/([a-z\d])([A-Z])/g, '$1 $2')
		// Normalize whitespace and convert to lowercase
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase()

	return spaced || 'request'
}

/**
 * Finds the first non-empty argument value, prioritizing the order defined by the command option
 * configuration.
 */
export function getPrimaryArgumentSummary(command: Command, args: Record<string, string>): string | null {
	const options = (command.config?.options as Array<{ name?: string }> | undefined) ?? []
	// Iterate through defined options in order
	for (const option of options) {
		const key = option?.name
		if (!key) {
			continue
		}
		const value = args[key]
		if (value) {
			return truncateArgument(value)
		}
	}

	// Fall back to any available argument value
	for (const value of Object.values(args)) {
		if (value) {
			return truncateArgument(value)
		}
	}

	return null
}

/**
 * Normalizes and truncates a string for display, collapsing whitespace and appending ellipsis when
 * the value exceeds the length threshold.
 */
export function truncateArgument(value: string, maxLength = 120): string {
	// Collapse multiple spaces into single spaces
	const normalized = value.replace(/\s+/g, ' ').trim()
	// Return as-is if within limit
	if (normalized.length <= maxLength) {
		return normalized
	}

	// Truncate and append ellipsis
	return normalized.slice(0, maxLength - 3) + '...'
}
