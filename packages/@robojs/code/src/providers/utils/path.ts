/**
 * Path utilities for @robojs/code SDK
 *
 * Provides path normalization, traversal detection, and deny-path matching.
 * All path operations must use these utilities to ensure security.
 */

import { pathTraversalError, policyViolationError } from '../../errors/index.js'

/**
 * Normalize a path by:
 * - Converting backslashes to forward slashes
 * - Removing redundant slashes
 * - Resolving . and .. segments
 * - Ensuring path starts with /
 *
 * @param path - The path to normalize
 * @returns Normalized path
 * @throws CodeAgentError if path contains traversal attempt
 */
export function normalizePath(path: string): string {
	// Handle empty path
	if (!path || path.trim() === '') {
		return '/'
	}

	// Decode URL-encoded characters that could be used for traversal
	let decoded = path
	try {
		// Decode common traversal patterns
		decoded = decoded.replace(/%2e/gi, '.').replace(/%2f/gi, '/').replace(/%5c/gi, '\\')
	} catch {
		// Ignore decoding errors
	}

	// Convert Windows backslashes to forward slashes
	decoded = decoded.replace(/\\/g, '/')

	// Remove null bytes (security)
	decoded = decoded.replace(/\0/g, '')

	// Collapse multiple slashes
	decoded = decoded.replace(/\/+/g, '/')

	// Ensure path starts with /
	if (!decoded.startsWith('/')) {
		decoded = '/' + decoded
	}

	// Split into segments and resolve . and ..
	const segments = decoded.split('/')
	const resolved: string[] = []

	for (const segment of segments) {
		if (segment === '' || segment === '.') {
			// Skip empty segments and current directory references
			continue
		}

		if (segment === '..') {
			// Pop from resolved if possible
			if (resolved.length > 0) {
				resolved.pop()
			}
			// If trying to go above root, this is a traversal attempt
			// We'll check this after resolution
		} else {
			resolved.push(segment)
		}
	}

	// Reconstruct path
	const result = '/' + resolved.join('/')
	return result
}

/**
 * Check if a path contains traversal attempts
 *
 * Traversal patterns detected:
 * - .. sequences that would escape the root
 * - URL-encoded traversal patterns
 * - Null bytes
 * - Other sneaky patterns
 *
 * @param path - The path to check
 * @returns true if traversal attempt detected
 */
export function hasTraversalAttempt(path: string): boolean {
	if (!path) {
		return false
	}

	// Check for null bytes
	if (path.includes('\0')) {
		return true
	}

	// Check for URL-encoded traversal patterns
	const encoded = path.toLowerCase()
	if (
		encoded.includes('%2e%2e') || // ..
		encoded.includes('%2e.') ||
		encoded.includes('.%2e') ||
		encoded.includes('%252e') || // double-encoded
		encoded.includes('%c0%ae') || // overlong UTF-8
		encoded.includes('%c1%9c') // overlong UTF-8 for backslash
	) {
		return true
	}

	// Normalize and check if .. would escape root
	const _normalized = normalizePath(path)

	// Count .. segments in original path
	const segments = path.replace(/\\/g, '/').split('/')
	let depth = 0
	let maxUp = 0

	for (const segment of segments) {
		const decoded = segment.replace(/%2e/gi, '.')

		if (decoded === '..') {
			maxUp++
			if (maxUp > depth) {
				// Trying to go above where we started - traversal attempt
				return true
			}
		} else if (decoded && decoded !== '.') {
			depth++
		}
	}

	return false
}

/**
 * Validate a path and throw if invalid
 *
 * @param path - The path to validate
 * @returns Normalized path
 * @throws CodeAgentError if path is invalid
 */
export function validatePath(path: string): string {
	if (hasTraversalAttempt(path)) {
		throw pathTraversalError(path)
	}
	return normalizePath(path)
}

/**
 * Check if a path matches any deny pattern
 *
 * Patterns can be:
 * - Exact match: ".env"
 * - Path prefix: ".git/"
 * - Glob-like: "*.secret"
 * - Anywhere in path: contains check
 *
 * @param path - The normalized path to check
 * @param denyPaths - Array of patterns to match against
 * @returns true if path matches a deny pattern
 */
export function matchesDenyPath(path: string, denyPaths: string[]): boolean {
	if (!denyPaths || denyPaths.length === 0) {
		return false
	}

	// Normalize the path for comparison
	const normalizedPath = normalizePath(path)
	const pathSegments = normalizedPath.split('/').filter(Boolean)
	const pathLower = normalizedPath.toLowerCase()

	for (const pattern of denyPaths) {
		if (!pattern) continue

		const patternLower = pattern.toLowerCase()

		// Exact segment match (e.g., ".env" matches "/.env" and "/foo/.env")
		if (!pattern.includes('/') && !pattern.includes('*')) {
			// Check if any segment matches exactly
			for (const segment of pathSegments) {
				if (segment.toLowerCase() === patternLower) {
					return true
				}
			}
		}

		// Path prefix match (e.g., ".git/" matches "/.git/anything")
		if (pattern.endsWith('/')) {
			const prefix = '/' + pattern.slice(0, -1).toLowerCase()
			if (pathLower.startsWith(prefix + '/') || pathLower === prefix) {
				return true
			}
			// Also check if pattern appears as a directory anywhere
			if (pathLower.includes(prefix + '/')) {
				return true
			}
		}

		// Glob-like suffix match (e.g., "*.secret" matches "/foo/bar.secret")
		if (pattern.startsWith('*')) {
			const suffix = patternLower.slice(1)
			if (pathLower.endsWith(suffix)) {
				return true
			}
		}

		// Glob-like prefix match (e.g., "secret*" matches "/foo/secretfile")
		if (pattern.endsWith('*') && !pattern.startsWith('*')) {
			const prefix = patternLower.slice(0, -1)
			for (const segment of pathSegments) {
				if (segment.toLowerCase().startsWith(prefix)) {
					return true
				}
			}
		}

		// Full path match
		if (pathLower === '/' + patternLower || pathLower === patternLower) {
			return true
		}

		// Check if pattern is a path component
		if (normalizedPath.includes('/' + pattern) || normalizedPath.includes('/' + pattern + '/')) {
			return true
		}
	}

	return false
}

/**
 * Validate a path against policy (both traversal and deny-paths)
 *
 * @param path - The path to validate
 * @param denyPaths - Array of deny patterns
 * @returns Normalized path
 * @throws CodeAgentError if path is invalid or denied
 */
export function validatePathWithPolicy(path: string, denyPaths?: string[]): string {
	const normalized = validatePath(path)

	if (denyPaths && matchesDenyPath(normalized, denyPaths)) {
		throw policyViolationError(`Access to path denied by policy: ${path}`, { path, denyPaths })
	}

	return normalized
}

/**
 * Check if a path is within a base directory
 *
 * @param path - The path to check
 * @param base - The base directory
 * @returns true if path is within base
 */
export function isWithinBase(path: string, base: string): boolean {
	const normalizedPath = normalizePath(path)
	const normalizedBase = normalizePath(base)

	// Path must start with base
	if (normalizedBase === '/') {
		return true
	}

	return normalizedPath === normalizedBase || normalizedPath.startsWith(normalizedBase + '/')
}

/**
 * Join path segments safely
 *
 * @param segments - Path segments to join
 * @returns Normalized joined path
 */
export function joinPath(...segments: string[]): string {
	const joined = segments.filter(Boolean).join('/')
	return normalizePath(joined)
}

/**
 * Get the directory name of a path
 *
 * @param path - The path
 * @returns Directory portion of path
 */
export function dirname(path: string): string {
	const normalized = normalizePath(path)
	const lastSlash = normalized.lastIndexOf('/')

	if (lastSlash <= 0) {
		return '/'
	}

	return normalized.slice(0, lastSlash)
}

/**
 * Get the base name of a path
 *
 * @param path - The path
 * @returns Base name (file/directory name)
 */
export function basename(path: string): string {
	const normalized = normalizePath(path)
	const lastSlash = normalized.lastIndexOf('/')

	if (lastSlash === normalized.length - 1) {
		// Path ends with slash, get second-to-last segment
		const withoutTrailing = normalized.slice(0, -1)
		const prevSlash = withoutTrailing.lastIndexOf('/')
		return withoutTrailing.slice(prevSlash + 1)
	}

	return normalized.slice(lastSlash + 1)
}
