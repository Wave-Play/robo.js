export type RoboRequest = {
	method: string
	params?: unknown
	headers: { get: (name: string) => string | null }
	json: () => Promise<unknown>
	url?: string
}

export function getServerEngine(): null {
	return null
}
