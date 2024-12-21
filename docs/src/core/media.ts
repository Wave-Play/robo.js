export interface MediaOptions {
	dpr?: number
	fit?: 'contain' | 'cover' | 'crop' | 'pad' | 'scale-down'
	format?: 'auto' | 'png' | 'jpg' | 'gif' | 'webp'
	height?: number
	size?: number
	width?: number
	crop?: 'fill' | 'thumb'
}

export const Media = {
	url,
	urlSet
}

function url(image?: string | null, options?: MediaOptions): string | null {
	if (!image) {
		return null
	}

	let url = 'https://waveplay.com/cdn-cgi/image/'
	if (options) {
		const { dpr, fit = 'cover', format = 'auto', size, width, height, crop } = options
		let token = ''

		if (dpr) {
			url += `${token}dpr=${dpr}`
			token = ','
		}
		if (fit) {
			url += `${token}fit=${fit}`
			token = ','
		}
		if (format) {
			url += `${token}format=${format}`
			token = ','
		}
		if (height) {
			url += `${token}height=${height}`
			token = ','
		}
		if (size) {
			url += `${token}height=${size},width=${size}`
			token = ','
		}
		if (width) {
			url += `${token}width=${width}`
			token = ','
		}
		if (crop) {
			url += `${token}c_${crop}`
			token = ','
		}
	}

	url += '/' + image
	return url
}

function urlSet(image: string | null, options: MediaOptions, scales = [1, 2, 3]): string | null {
	const baseWidth = options.width || 0
	const baseHeight = options.height || 0

	return scales
		.map((scale) => `${url(image, { width: baseWidth * scale, height: baseHeight * scale })} ${scale}x`)
		.join(', ')
}
