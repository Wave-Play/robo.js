/**
 * Audio Player Tests
 *
 * These tests verify that @discordjs/voice AudioPlayer works correctly.
 *
 * Note: Uses StreamType.Raw to skip FFmpeg transcoding requirement.
 * Tests are split into two groups:
 * 1. Basic tests that don't need voice connections
 * 2. Integration tests that need voice connections (skipped due to TLS requirements)
 */
import { Readable } from 'stream'
import {
	createAudioPlayer,
	createAudioResource,
	AudioPlayerStatus,
	NoSubscriberBehavior,
	StreamType
} from '@discordjs/voice'

/**
 * Create a silent audio stream for testing
 * Returns a Readable stream that emits silence
 */
function createSilentStream(): Readable {
	return new Readable({
		read() {
			// Push 20ms of silence at 48kHz stereo (3840 bytes)
			this.push(Buffer.alloc(3840))
			this.push(null) // End the stream
		}
	})
}

describe('Audio Player', () => {
	it('should create audio player', () => {
		const player = createAudioPlayer()

		expect(player).toBeDefined()
		expect(player.state.status).toBe(AudioPlayerStatus.Idle)
	})

	it('should create player with options', () => {
		const player = createAudioPlayer({
			behaviors: {
				noSubscriber: NoSubscriberBehavior.Pause
			}
		})

		expect(player).toBeDefined()
	})

	it('should emit state change events', async () => {
		const player = createAudioPlayer()

		// Handle potential errors from opusscript cleanup
		player.on('error', () => {
			// Ignore opusscript cleanup errors
		})

		const stateChangePromise = new Promise<AudioPlayerStatus>((resolve) => {
			player.once('stateChange', (_oldState, newState) => {
				resolve(newState.status)
			})
		})

		const resource = createAudioResource(createSilentStream(), {
			inputType: StreamType.Raw
		})
		player.play(resource)

		const newStatus = await stateChangePromise

		// Status should change from Idle to Playing (or Buffering)
		expect([AudioPlayerStatus.Playing, AudioPlayerStatus.Buffering]).toContain(newStatus)

		// Clean stop
		player.stop(true)
	})

	it('should stop player', () => {
		const player = createAudioPlayer()

		// Handle potential errors from opusscript cleanup
		player.on('error', () => {
			// Ignore opusscript cleanup errors
		})

		// Start with a resource
		const resource = createAudioResource(createSilentStream(), {
			inputType: StreamType.Raw
		})
		player.play(resource)

		// Stop returns true if there was something to stop
		const stopped = player.stop(true)

		expect(stopped).toBe(true)
		// After stopping, player should be idle
		expect(player.state.status).toBe(AudioPlayerStatus.Idle)
	})
})

/**
 * Tests that require actual voice connections.
 * These are skipped because @discordjs/voice always uses wss:// and
 * TLS handshake issues occur with self-signed certificates in test environments.
 */
describe.skip('Audio Player (Voice Connection)', () => {
	// These tests would require:
	// - Client setup with voice intents
	// - Voice channel creation
	// - joinVoiceChannel() to establish connection
	// - Proper TLS certificate handling

	it('should subscribe connection to player', () => {
		// Requires voice connection
	})

	it('should play audio resource with connection', () => {
		// Requires voice connection
	})

	it('should pause and unpause with connection', () => {
		// Requires voice connection
	})

	it('should have playbackDuration with connection', () => {
		// Requires voice connection
	})
})
