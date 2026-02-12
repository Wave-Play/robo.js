/**
 * Audio Resource Tests
 *
 * These tests verify that @discordjs/voice AudioResource works correctly.
 * Note: These tests use StreamType.Raw to skip FFmpeg transcoding requirement.
 */
import { Readable } from 'stream'
import { createAudioResource, StreamType } from '@discordjs/voice'

/**
 * Create a silent audio stream for testing
 * Uses raw PCM format (48kHz, stereo, 16-bit signed little-endian)
 */
function createSilentStream(): Readable {
	return new Readable({
		read() {
			// Push 20ms of silence at 48kHz stereo (3840 bytes)
			this.push(Buffer.alloc(3840))
			this.push(null)
		}
	})
}

describe('Audio Resource', () => {
	it('should create from stream', () => {
		const resource = createAudioResource(createSilentStream(), {
			inputType: StreamType.Raw
		})

		expect(resource).toBeDefined()
		expect(resource.playbackDuration).toBe(0)
	})

	it('should create with metadata', () => {
		const resource = createAudioResource(createSilentStream(), {
			inputType: StreamType.Raw,
			metadata: {
				title: 'Test Song',
				artist: 'Test Artist'
			}
		})

		expect(resource.metadata.title).toBe('Test Song')
		expect(resource.metadata.artist).toBe('Test Artist')
	})

	it('should create with inlineVolume', () => {
		const resource = createAudioResource(createSilentStream(), {
			inputType: StreamType.Raw,
			inlineVolume: true
		})

		expect(resource.volume).toBeDefined()
	})

	it('should set volume', () => {
		const resource = createAudioResource(createSilentStream(), {
			inputType: StreamType.Raw,
			inlineVolume: true
		})

		resource.volume?.setVolume(0.5)

		expect(resource.volume?.volume).toBe(0.5)
	})

	it('should set volume in decibels', () => {
		const resource = createAudioResource(createSilentStream(), {
			inputType: StreamType.Raw,
			inlineVolume: true
		})

		resource.volume?.setVolumeDecibels(-10)

		expect(resource.volume?.volumeDecibels).toBeCloseTo(-10, 1)
	})

	it('should set volume logarithmic', () => {
		const resource = createAudioResource(createSilentStream(), {
			inputType: StreamType.Raw,
			inlineVolume: true
		})

		resource.volume?.setVolumeLogarithmic(0.5)

		expect(resource.volume?.volumeLogarithmic).toBe(0.5)
	})

	it('should track playback duration', () => {
		const resource = createAudioResource(createSilentStream(), {
			inputType: StreamType.Raw
		})

		expect(resource.playbackDuration).toBe(0)
		expect(resource.started).toBe(false)
	})

	it('should have readable stream', () => {
		const resource = createAudioResource(createSilentStream(), {
			inputType: StreamType.Raw
		})

		expect(resource.readable).toBe(true)
	})
})
