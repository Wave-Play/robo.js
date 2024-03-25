import { request } from './client.js'
import type { ListResult, Pod, Robo } from './types.js'

interface GetPodLogsOptions {
	bearerToken: string
	podId: string
}

interface GetPodLogsResult {
	error?: string
	logs: Array<{
		ingestionTime: number
		message: string
		timestamp: number
	}>
	success: boolean
}

export async function getPodLogs(options: GetPodLogsOptions) {
	const { bearerToken, podId } = options

	return request<GetPodLogsResult>(`/pod/${podId}/logs`, {
		headers: {
			Authorization: `Bearer ${bearerToken}`
		}
	})
}

interface GetPodStatusOptions {
	bearerToken: string
	podId: string
}

interface GetPodStatusResult {
	error?: string
	status: Pod['status']
	success: boolean
}

export async function getPodStatus(options: GetPodStatusOptions) {
	const { bearerToken, podId } = options

	return request<GetPodStatusResult>(`/pod/${podId}/status`, {
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

interface ListPodsOptions {
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

interface ListRobosOptions {
	bearerToken: string
	userId: string
}

export async function listRobos(options: ListRobosOptions) {
	const { bearerToken, userId } = options

	return request<ListResult<Robo>>(`/user/${userId}/robos`, {
		headers: {
			Authorization: `Bearer ${bearerToken}`
		}
	})
}

interface StartPodOptions {
	bearerToken: string
	podId: string
}

interface StartPodResult {
	error?: string
	success: boolean
}

export async function startPod(options: StartPodOptions) {
	const { bearerToken, podId } = options

	return request<StartPodResult>(`/pod/${podId}/start`, {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${bearerToken}`
		}
	})
}

interface StopPodOptions {
	bearerToken: string
	podId: string
}

interface StopPodResult {
	error?: string
	success: boolean
}

export async function stopPod(options: StopPodOptions) {
	const { bearerToken, podId } = options

	return request<StopPodResult>(`/pod/${podId}/stop`, {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${bearerToken}`
		}
	})
}
