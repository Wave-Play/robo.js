export function ensureLeadingSlash(path: string): string {
	if (!path.startsWith('/')) {
		return '/' + path
	}
	return path
}

export function stripTrailingSlash(path: string): string {
	if (path.length > 1 && path.endsWith('/')) {
		return path.slice(0, -1)
	}
	return path
}

export function joinPath(base: string, suffix: string): string {
	const normalizedBase = stripTrailingSlash(ensureLeadingSlash(base))
	const normalizedSuffix = ensureLeadingSlash(suffix)
	return normalizedBase === '/' ? normalizedSuffix : normalizedBase + normalizedSuffix
}
