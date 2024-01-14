import { request } from './client.js'
import type { ListResult, Pod, Robo } from './types.js'

interface ListPodsOptions {
	bearerToken: string
	userId: string
}

interface ListRobosOptions {
	bearerToken: string
	userId: string
}

export async function listPods(options: ListPodsOptions) {
	const { bearerToken, userId } = options

	return request<ListResult<Pod>>(`/user/${userId}/pods`, {
		headers: {
			Authorization: `Bearer ${bearerToken}`
		}
	})
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
