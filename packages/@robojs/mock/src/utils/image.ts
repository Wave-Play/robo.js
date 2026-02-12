/**
 * Image Dimension Detection
 *
 * Extracts width/height from common image formats without external dependencies.
 * Reads binary headers directly from Uint8Array data.
 */

export interface ImageDimensions {
	width: number
	height: number
}

/**
 * Extract dimensions from common image formats
 *
 * @param data - Image file data as Uint8Array
 * @param contentType - MIME type of the image
 * @returns Dimensions if detected, null otherwise
 */
export function getImageDimensions(data: Uint8Array, contentType: string): ImageDimensions | null {
	try {
		if (contentType === 'image/png') {
			return getPngDimensions(data)
		} else if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
			return getJpegDimensions(data)
		} else if (contentType === 'image/gif') {
			return getGifDimensions(data)
		} else if (contentType === 'image/webp') {
			return getWebpDimensions(data)
		}
	} catch {
		return null
	}
	return null
}

/**
 * Check if a content type is an image
 */
export function isImageContentType(contentType: string): boolean {
	return contentType.startsWith('image/')
}

/**
 * PNG: Width at bytes 16-19, height at bytes 20-23 (big-endian)
 * Header: 89 50 4E 47 0D 0A 1A 0A + IHDR chunk
 */
function getPngDimensions(data: Uint8Array): ImageDimensions | null {
	if (data.length < 24) return null

	// Verify PNG signature
	if (data[0] !== 0x89 || data[1] !== 0x50 || data[2] !== 0x4e || data[3] !== 0x47) {
		return null
	}

	const width = (data[16] << 24) | (data[17] << 16) | (data[18] << 8) | data[19]
	const height = (data[20] << 24) | (data[21] << 16) | (data[22] << 8) | data[23]

	return { width, height }
}

/**
 * JPEG: Find SOF0 marker (0xFF 0xC0) and read dimensions
 * Height at offset+5, width at offset+7 (big-endian, 2 bytes each)
 */
function getJpegDimensions(data: Uint8Array): ImageDimensions | null {
	// Verify JPEG signature
	if (data[0] !== 0xff || data[1] !== 0xd8) {
		return null
	}

	let offset = 2
	while (offset < data.length - 9) {
		// Look for marker prefix
		if (data[offset] !== 0xff) {
			offset++
			continue
		}

		const marker = data[offset + 1]

		// SOF markers: 0xC0-0xCF (except 0xC4, 0xC8, 0xCC which are other markers)
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
			const height = (data[offset + 5] << 8) | data[offset + 6]
			const width = (data[offset + 7] << 8) | data[offset + 8]
			return { width, height }
		}

		// Skip to next marker using segment length
		const length = (data[offset + 2] << 8) | data[offset + 3]
		offset += 2 + length
	}

	return null
}

/**
 * GIF: Width at bytes 6-7, height at bytes 8-9 (little-endian)
 * Header: 47 49 46 38 (GIF8)
 */
function getGifDimensions(data: Uint8Array): ImageDimensions | null {
	if (data.length < 10) return null

	// Verify GIF signature
	if (data[0] !== 0x47 || data[1] !== 0x49 || data[2] !== 0x46) {
		return null
	}

	const width = data[6] | (data[7] << 8)
	const height = data[8] | (data[9] << 8)

	return { width, height }
}

/**
 * WebP: Parse RIFF container to find VP8/VP8L/VP8X chunk
 * More complex format with multiple chunk types
 */
function getWebpDimensions(data: Uint8Array): ImageDimensions | null {
	if (data.length < 30) return null

	// Verify RIFF header
	if (data[0] !== 0x52 || data[1] !== 0x49 || data[2] !== 0x46 || data[3] !== 0x46) {
		return null
	}

	// Verify WEBP signature
	if (data[8] !== 0x57 || data[9] !== 0x45 || data[10] !== 0x42 || data[11] !== 0x50) {
		return null
	}

	// Check chunk type at offset 12
	const chunkType = String.fromCharCode(data[12], data[13], data[14], data[15])

	if (chunkType === 'VP8 ') {
		// Lossy WebP - dimensions at offset 26-29
		if (data.length < 30) return null
		const width = (data[26] | (data[27] << 8)) & 0x3fff
		const height = (data[28] | (data[29] << 8)) & 0x3fff
		return { width, height }
	} else if (chunkType === 'VP8L') {
		// Lossless WebP - dimensions packed in 4 bytes at offset 21
		if (data.length < 25) return null
		const signature = data[21]
		if (signature !== 0x2f) return null

		const bits = data[22] | (data[23] << 8) | (data[24] << 16) | (data[25] << 24)
		const width = (bits & 0x3fff) + 1
		const height = ((bits >> 14) & 0x3fff) + 1
		return { width, height }
	} else if (chunkType === 'VP8X') {
		// Extended WebP - dimensions at offset 24-29
		if (data.length < 30) return null
		const width = (data[24] | (data[25] << 8) | (data[26] << 16)) + 1
		const height = (data[27] | (data[28] << 8) | (data[29] << 16)) + 1
		return { width, height }
	}

	return null
}
