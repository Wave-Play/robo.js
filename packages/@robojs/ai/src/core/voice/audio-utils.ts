/** Audio format conversion and processing utilities for voice capture and playback. */

/**
 * Converts a Node.js Buffer to an Int16Array view without copying underlying memory.
 */
export function bufferToInt16(buffer: Buffer): Int16Array {
	return new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / Int16Array.BYTES_PER_ELEMENT)
}

/**
 * Converts multi-channel audio samples to mono by averaging channels per sample position.
 */
export function toMono(samples: Int16Array, channels: number): Int16Array {
	// Return copy if already mono.
	if (channels <= 1) {
		return samples.slice()
	}

	const mono = new Int16Array(samples.length / channels)
	// Average all channels for each sample position.
	for (let i = 0; i < mono.length; i++) {
		let sum = 0
		for (let channel = 0; channel < channels; channel++) {
			sum += samples[i * channels + channel]
		}
		mono[i] = sum / channels
	}

	return mono
}

/**
 * Downsamples audio to a lower sample rate using a simple averaging algorithm suitable for voice.
 */
export function downsample(samples: Int16Array, inputRate: number, outputRate: number): Int16Array {
	// Return as-is if rates match.
	if (outputRate === inputRate) {
		return samples
	}
	// Validate this is actually downsampling.
	if (outputRate > inputRate) {
		throw new Error(`Downsample expects outputRate <= inputRate`)
	}

	// Calculate downsampling ratio.
	const ratio = inputRate / outputRate
	const newLength = Math.floor(samples.length / ratio)
	const result = new Int16Array(newLength)

	// Average samples within each output sample's window.
	for (let i = 0; i < newLength; i++) {
		const start = Math.floor(i * ratio)
		const end = Math.min(samples.length, Math.floor((i + 1) * ratio))
		let sum = 0
		let count = 0
		for (let j = start; j < end; j++) {
			sum += samples[j]
			count += 1
		}
		if (count === 0) {
			break
		}

		// Clamp to Int16 range.
		result[i] = clampInt16(sum / count)
	}

	return result
}

/**
 * Upsamples audio to a higher sample rate using linear interpolation between adjacent samples.
 */
export function upsample(samples: Int16Array, inputRate: number, outputRate: number): Int16Array {
	// Return as-is if rates match.
	if (outputRate === inputRate) {
		return samples
	}
	// Validate this is actually upsampling.
	if (outputRate < inputRate) {
		throw new Error(`Upsample expects outputRate >= inputRate`)
	}

	// Calculate upsampling ratio.
	const ratio = outputRate / inputRate
	const newLength = Math.floor(samples.length * ratio)
	const result = new Int16Array(newLength)

	// Interpolate between adjacent samples.
	for (let i = 0; i < newLength; i++) {
		const sourceIndex = i / ratio
		const lowerIndex = Math.floor(sourceIndex)
		const upperIndex = Math.min(samples.length - 1, lowerIndex + 1)
		const weight = sourceIndex - lowerIndex
		// Linear interpolation with weight.
		const value = samples[lowerIndex] * (1 - weight) + samples[upperIndex] * weight
		// Clamp to Int16 range.
		result[i] = clampInt16(value)
	}

	return result
}

/**
 * Converts an Int16Array to a Buffer view without copying data.
 */
export function int16ToBuffer(samples: Int16Array): Buffer {
	return Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)
}

/**
 * Calculates normalized RMS energy (0-1) for voice activity detection thresholds.
 */
export function calculateRms(samples: Int16Array): number {
	// Return 0 for empty input.
	if (samples.length === 0) {
		return 0
	}

	// Sum squared samples.
	let sumSquares = 0
	for (const sample of samples) {
		sumSquares += sample * sample
	}

	// Calculate RMS and normalize to 0-1 range.
	return Math.sqrt(sumSquares / samples.length) / 32768
}

/** Clamps a numeric value to the Int16 range (-32768 to 32767). */
function clampInt16(value: number): number {
	return Math.max(-32768, Math.min(32767, value))
}
