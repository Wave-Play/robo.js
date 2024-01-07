import { request } from './client.js'
import type { Robo } from './types.js'

interface ListRobosOptions {
	bearerToken: string
	userId: string
}

interface ListResult<T = unknown> {
	data: T[]
	success: boolean
}

export async function listRobos(options: ListRobosOptions) {
	const { bearerToken, userId } = options

	return request<ListResult<Robo>>(`/user/${userId}/robos`, {
		headers: {
			Authorization: `Bearer ${bearerToken}`
		}
	})
}

interface GetRoboStatusOptions {
	bearerToken?: string
	roboId: string
}

interface GetRoboStatusResult {
	error?: string
	status: 'online' | 'offline'
	success: boolean
}

export async function getRoboStatus(options: GetRoboStatusOptions) {
	const { bearerToken, roboId } = options

	return request<GetRoboStatusResult>(`/robo/${roboId}/status`, {
		backoff: false,
		headers: {
			Authorization: bearerToken ? `Bearer ${bearerToken}` : undefined
		},
		silent: true
	})
}
