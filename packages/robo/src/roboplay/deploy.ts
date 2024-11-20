import { uploadToBackblazeB2 } from '../cli/utils/upload.js'
import { request, requestStream } from './client.js'
import type { Deployment, DeploymentLog, Pod } from './types.js'

interface CreateDeploymentOptions {
	bearerToken: string
}

interface CreateDeploymentResult {
	deploy: {
		id: string
	}
	error?: string
	signature?: string
	success?: boolean
	upload: {
		key: string
		token: string
		url: string
	}
	url?: string
}

export async function createDeployment(options: CreateDeploymentOptions) {
	const { bearerToken } = options

	return request<CreateDeploymentResult>('/deploy', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${bearerToken}`
		}
	})
}

interface StreamDeploymentOptions {
	deploymentId: string
	signature?: string
}

type StreamDeploymentCallback = (
	error: Error | Event,
	data: {
		deployment?: Deployment
		logs?: DeploymentLog[]
		podStatus?: Pod['status']
	}
) => void | Promise<void>

export function streamDeployment(options: StreamDeploymentOptions, callback: StreamDeploymentCallback) {
	const { deploymentId, signature } = options

	return requestStream(`/deploy-stream/${deploymentId}?signature=${signature}`, callback)
}

interface UpdateDeploymentOptions {
	bearerToken: string
	deployId: string
	event: 'upload-failed' | 'upload-success'
}

interface UpdateDeploymentResult {
	error?: string
	success?: boolean
}

export async function updateDeployment(options: UpdateDeploymentOptions) {
	const { bearerToken, deployId, event } = options

	return request<UpdateDeploymentResult>(`/deploy/${deployId}`, {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${bearerToken}`
		},
		body: { event }
	})
}

interface UploadBundleOptions {
	bundlePath: string
	uploadKey: string
	uploadToken: string
	uploadUrl: string
}

export async function uploadBundle(options: UploadBundleOptions) {
	const { bundlePath, uploadKey, uploadToken, uploadUrl } = options

	await uploadToBackblazeB2(uploadUrl, uploadToken, bundlePath, uploadKey)
}
