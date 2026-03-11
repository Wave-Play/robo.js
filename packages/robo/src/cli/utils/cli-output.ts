/**
 * Output formatting utilities for interactive CLI commands.
 */

import { color } from '../../core/color.js'

const SENSITIVE_PATTERNS = /^(.*_)?(token|secret|password|key|api_key|credential|auth|private)(_.*)?$/i

/**
 * Masks sensitive values for display.
 * Shows first/last 3 chars with **** in between for values longer than 8 chars.
 */
export function maskSensitive(key: string, value: string): string {
	if (!SENSITIVE_PATTERNS.test(key)) {
		return value
	}

	if (value.length <= 8) {
		return '****'
	}

	return value.slice(0, 3) + '****' + value.slice(-3)
}

/**
 * Formats key-value pairs as an aligned table.
 */
export function formatTable(entries: [string, string][], indent = '  '): string {
	if (entries.length === 0) {
		return ''
	}

	const maxKeyLen = Math.max(...entries.map(([k]) => k.length))

	return entries.map(([key, value]) => `${indent}${key.padEnd(maxKeyLen)}  ${value}`).join('\n')
}

/**
 * Formats a bold section header.
 */
export function formatHeader(title: string): string {
	return color.bold(title)
}

/**
 * Compact JSON display with truncation for complex values.
 */
export function formatValue(value: unknown): string {
	if (value === null) {
		return color.dim('null')
	}
	if (value === undefined) {
		return color.dim('undefined')
	}
	if (typeof value === 'string') {
		return truncate(value, 120)
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value)
	}

	try {
		const json = JSON.stringify(value)
		return truncate(json, 120)
	} catch {
		return color.dim('[unserializable]')
	}
}

/**
 * Truncates long strings with an ellipsis indicator.
 */
export function truncate(value: string, maxLen = 120): string {
	if (value.length <= maxLen) {
		return value
	}

	return value.slice(0, maxLen - 3) + color.dim('...')
}
