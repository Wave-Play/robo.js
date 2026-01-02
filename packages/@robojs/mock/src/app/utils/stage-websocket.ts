export function buildStageToken(sessionId: string): string {
	const isDiscordLikeToken = sessionId.includes('.') && sessionId.split('.').length === 3
	if (sessionId.startsWith('mock:') || isDiscordLikeToken) {
		return sessionId
	}
	return `mock:${sessionId}`
}

function decodeBase64Url(value: string): string | null {
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
	const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
	try {
		return atob(`${normalized}${padding}`)
	} catch {
		return null
	}
}

export function parseStageSessionId(value: string): string | null {
	let normalized = value.trim().replace(/\/+$/, '')
	if (normalized.startsWith('mock:')) {
		normalized = normalized.slice(5)
	}
	const parts = normalized.split('.')
	if (parts.length === 3 && parts[1] === 'TU9DSw') {
		const sessionPart = parts[2].replace(/[_/]+$/, '')
		const decoded = decodeBase64Url(sessionPart)
		return decoded ?? null
	}
	if (normalized.startsWith('sess_')) {
		return normalized
	}
	return null
}

export function normalizeStageSessionId(value: string): string {
	const parsed = parseStageSessionId(value)
	return parsed ?? value.trim().replace(/\/+$/, '')
}

export function buildStageWebSocketUrls(sessionId: string): string[] {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
	const host = window.location.host
	const pathname = window.location.pathname
	const stageIndex = pathname.indexOf('/stage')
	const basePath = stageIndex !== -1 ? pathname.slice(0, stageIndex + '/stage'.length) : '/stage'
	const token = encodeURIComponent(buildStageToken(sessionId))
	const origin = `${protocol}//${host}`
	const urls = [`${origin}${basePath}/ws?token=${token}`]

	if (basePath !== '/stage') {
		urls.push(`${origin}/stage/ws?token=${token}`)
	}

	return Array.from(new Set(urls))
}
