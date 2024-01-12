import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { color } from '../../core/color.js'
import { logger } from '../../core/logger.js'

async function calculateSha1(fileBuffer: Buffer): Promise<string> {
	return new Promise((resolve) => {
		const hash = crypto.createHash('sha1')
		hash.update(fileBuffer)

		resolve(hash.digest('hex'))
	})
}

export async function uploadToBackblazeB2(uploadUrl: string, authToken: string, filePath: string, fileName: string) {
	const maxRetries = 5

	// Read the file as a buffer
	const fileBuffer = await fs.readFile(filePath)
	const sha1 = await calculateSha1(fileBuffer)
	logger.debug(`Uploading`, color.bold(filePath), 'to', color.bold(uploadUrl))
	logger.debug(`Upload key:`, fileName)
	logger.debug(`SHA1: ${sha1}`)

	for (let attempt = 0; attempt <= maxRetries - 1; attempt++) {
		try {
			const startTime = Date.now()
			const response = await fetch(uploadUrl, {
				method: 'POST',
				headers: {
					Authorization: authToken,
					'Content-Type': 'application/gzip',
					'X-Bz-File-Name': fileName,
					'X-Bz-Content-Sha1': sha1
				},
				body: fileBuffer
			})

			// If successful, break out of the loop
			logger.debug(`Upload successful (status ${response.status}) in ${Date.now() - startTime}ms`)
			break
		} catch (error) {
			logger.debug(`Error uploading file (attempt ${attempt}):`, error)

			// If the maximum number of retries has been reached, throw the error
			if (attempt === maxRetries) {
				throw new Error(
					`Failed to upload file after ${maxRetries} attempts: ${
						error instanceof Error ? error.message : 'Unknown error'
					}`
				)
			}
		}
	}
}
