/**
 * Multipart Form Data Parser
 *
 * Parses multipart/form-data requests using the Fetch API's native formData() method.
 * Used for file uploads in Discord API endpoints.
 */
import { AttachmentLimits } from '../types/index.js'

export interface UploadedFile {
	filename: string
	contentType: string
	size: number
	data: Uint8Array
	/** Whether filename starts with SPOILER_ */
	isSpoiler: boolean
}

export interface ParsedMultipart {
	body: Record<string, unknown>
	files: UploadedFile[]
}

// Use constants from types
const MAX_FILES = AttachmentLimits.MAX_FILES_PER_MESSAGE
const MAX_TOTAL_SIZE = AttachmentLimits.MAX_TOTAL_SIZE
const MAX_DESCRIPTION_LENGTH = AttachmentLimits.MAX_DESCRIPTION_LENGTH

/**
 * Parse a multipart/form-data request
 *
 * Discord sends multipart requests with:
 * - payload_json: JSON body with message content, embeds, attachments metadata
 * - files[0], files[1], etc.: Uploaded file data
 *
 * @param request - The incoming request with multipart content
 * @returns Parsed body and files
 * @throws Error if parsing fails or limits are exceeded
 */
export async function parseMultipartMessage(request: Request): Promise<ParsedMultipart> {
	const formData = await request.formData()

	let body: Record<string, unknown> = {}
	const files: UploadedFile[] = []

	// Parse payload_json if present
	const payloadJson = formData.get('payload_json')
	if (payloadJson !== null) {
		if (typeof payloadJson === 'string') {
			try {
				body = JSON.parse(payloadJson)
			} catch {
				throw new MultipartError('Invalid payload_json', 50035)
			}
		} else if (payloadJson instanceof File) {
			// payload_json should be a string, not a file
			const text = await payloadJson.text()
			try {
				body = JSON.parse(text)
			} catch {
				throw new MultipartError('Invalid payload_json', 50035)
			}
		}
	}

	// Process files (files[0], files[1], etc.)
	for (const [key, value] of formData.entries()) {
		if (key.startsWith('files[') && value instanceof File) {
			const arrayBuffer = await value.arrayBuffer()
			const filename = value.name || 'unknown'
			files.push({
				filename,
				contentType: value.type || 'application/octet-stream',
				size: value.size,
				data: new Uint8Array(arrayBuffer),
				isSpoiler: filename.startsWith(AttachmentLimits.SPOILER_PREFIX)
			})
		}
	}

	// Enforce file count limit
	if (files.length > MAX_FILES) {
		throw new MultipartError(`Maximum ${MAX_FILES} files per message`, 50035)
	}

	// Enforce total size limit
	const totalSize = files.reduce((sum, f) => sum + f.size, 0)
	if (totalSize > MAX_TOTAL_SIZE) {
		throw new MultipartError('Request entity too large', 40005)
	}

	// Validate attachment descriptions (alt text) if provided
	const attachments = body.attachments as Array<{ description?: string }> | undefined
	if (attachments) {
		for (const attachment of attachments) {
			if (attachment.description && attachment.description.length > MAX_DESCRIPTION_LENGTH) {
				throw new MultipartError(
					`Attachment description exceeds maximum length of ${MAX_DESCRIPTION_LENGTH} characters`,
					50035
				)
			}
		}
	}

	return { body, files }
}

/**
 * Check if a request is multipart/form-data
 */
export function isMultipartRequest(request: Request): boolean {
	const contentType = request.headers.get('content-type') || ''
	return contentType.includes('multipart/form-data')
}

/**
 * Error class for multipart parsing errors
 */
export class MultipartError extends Error {
	readonly code: number

	constructor(message: string, code: number) {
		super(message)
		this.name = 'MultipartError'
		this.code = code
	}
}
