import fs from 'node:fs/promises'
import crypto from 'node:crypto'
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

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			// Read the file as a buffer
			const fileBuffer = await fs.readFile(filePath)
			const sha1 = await calculateSha1(fileBuffer)

			await fetch(uploadUrl, {
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
			break
		} catch (error) {
			logger.error(`Error uploading file (attempt ${attempt}):`, error)

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
