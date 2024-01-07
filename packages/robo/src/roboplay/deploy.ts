import { uploadToBackblazeB2 } from '../cli/utils/upload.js'
import { request } from './client.js'

interface CreateDeploymentOptions {
	bearerToken: string
}

interface CreateDeploymentResult {
	deploy: {
		id: string
	}
	error?: string
	success?: boolean
	upload: {
		key: string
		token: string
		url: string
	}
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

interface UpdateDeploymentOptions {
	bearerToken: string
	deployId: string
}

export async function updateDeployment(options: UpdateDeploymentOptions) {
	const { bearerToken, deployId } = options

	return request(`/deploy/${deployId}`, {
		method: 'PUT',
		headers: {
			Authorization: `Bearer ${bearerToken}`
		}
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
