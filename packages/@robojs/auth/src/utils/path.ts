/** Adds a leading slash to the provided path when one is missing. */
export function ensureLeadingSlash(path: string): string {
	if (!path.startsWith('/')) {
		return '/' + path
	}
	return path
}

/** Removes trailing slashes except when the path is the root (`/`). */
export function stripTrailingSlash(path: string): string {
	if (path.length > 1 && path.endsWith('/')) {
		return path.slice(0, -1)
	}
	return path
}

/** Concatenates base and suffix ensuring exactly one slash between them. */
export function joinPath(base: string, suffix: string): string {
	const normalizedBase = stripTrailingSlash(ensureLeadingSlash(base))
	const normalizedSuffix = ensureLeadingSlash(suffix)
	return normalizedBase === '/' ? normalizedSuffix : normalizedBase + normalizedSuffix
}
