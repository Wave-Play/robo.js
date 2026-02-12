import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'

/**
 * GET /api/cdn/attachments/:channelId/:attachmentId/:filename
 *
 * Serve stored file attachments with appropriate headers.
 * This simulates Discord's CDN for serving uploaded files.
 *
 * Note: Since CDN URLs don't use Authorization headers, we need an alternative
 * way to identify the session. We use a custom X-Mock-Session header or
 * iterate through sessions to find the attachment.
 */
export default async (request: RoboRequest) => {
	if (request.method !== 'GET') {
		return new Response(JSON.stringify({ message: 'Method not allowed' }), {
			status: 405,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const { channelId, attachmentId, filename: _filename } = request.params as {
		channelId: string
		attachmentId: string
		filename: string
	}

	// Try to find the attachment in any session
	// In a real CDN, the URL itself would encode the necessary info
	// For mock purposes, we search all sessions

	// First check for X-Mock-Session header (preferred method)
	const sessionId = request.headers.get('X-Mock-Session')
	if (sessionId) {
		const session = sessionManager.get(sessionId)
		if (session) {
			const attachment = session.state.getAttachment(attachmentId)
			if (attachment && attachment.channelId === channelId) {
				return serveAttachment(attachment.data, attachment.contentType, attachment.filename)
			}
		}
	}

	// Fall back to searching all sessions
	for (const session of sessionManager.getAll()) {
		const attachment = session.state.getAttachment(attachmentId)
		if (attachment && attachment.channelId === channelId) {
			return serveAttachment(attachment.data, attachment.contentType, attachment.filename)
		}
	}

	// Attachment not found
	return new Response(JSON.stringify({ code: 10015, message: 'Unknown Attachment' }), {
		status: 404,
		headers: { 'Content-Type': 'application/json' }
	})
}

/**
 * Create a Response that serves the attachment file
 *
 * Content-Disposition behavior matches Discord:
 * - Images/videos use 'inline' for preview
 * - Other files or spoilers use 'attachment' to force download
 * - Uses RFC 5987 filename* for proper Unicode support
 */
function serveAttachment(data: Uint8Array, contentType: string, filename: string): Response {
	// Check if file is spoilered (starts with SPOILER_)
	const isSpoiler = filename.startsWith('SPOILER_')

	// Determine disposition type
	// Images and videos should inline (preview), unless spoilered
	// Other files should attachment (download)
	const isPreviewable = contentType.startsWith('image/') || contentType.startsWith('video/')
	const disposition = isPreviewable && !isSpoiler ? 'inline' : 'attachment'

	// RFC 5987 encoding for filename* (supports full UTF-8)
	// Format: filename*=UTF-8''encoded-filename
	const encodedFilename = encodeURIComponent(filename).replace(/['()]/g, escape)
	const contentDisposition = `${disposition}; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`

	// Convert Uint8Array to Blob for Response body
	// Create a new Uint8Array that is guaranteed to be a valid BlobPart
	const blobData = new Uint8Array(data)
	const blob = new Blob([blobData], { type: contentType })

	return new Response(blob, {
		status: 200,
		headers: {
			'Content-Type': contentType,
			'Content-Length': String(data.length),
			'Content-Disposition': contentDisposition,
			'Cache-Control': 'public, max-age=31536000',
			'Access-Control-Allow-Origin': '*'
		}
	})
}
