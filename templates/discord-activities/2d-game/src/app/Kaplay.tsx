import kaplay from 'kaplay'

/**
 * Kaplay game here
 */
export default function game() {
	const k = kaplay({
		letterbox: true,
		global: false,
		debug: true,
		width: window.innerWidth,
		height: window.innerHeight,
		pixelDensity: devicePixelRatio
	})

	return k
}
