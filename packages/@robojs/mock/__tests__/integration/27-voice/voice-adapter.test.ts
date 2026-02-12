/**
 * Voice Adapter Creator Tests
 *
 * These tests verify that discord.js provides the correct voice adapter
 * infrastructure for @discordjs/voice.
 */
import { Client, GatewayIntentBits, type Guild } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Voice Adapter Creator', () => {
	let client: Client | null = null
	let guild: Guild

	beforeAll(async () => {
		const session = await createSession({
			name: 'voice-adapter-test',
			config: {
				botUser: { username: 'VoiceAdapterBot' },
				guilds: [{ name: 'Voice Adapter Guild' }]
			}
		})

		client = createTestClient({
			intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
		})
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have voiceAdapterCreator on guild', () => {
		expect(guild.voiceAdapterCreator).toBeDefined()
		expect(typeof guild.voiceAdapterCreator).toBe('function')
	})

	it('should track voice adapters on client', () => {
		expect(client!.voice).toBeDefined()
		expect(client!.voice.adapters).toBeDefined()
		expect(client!.voice.adapters).toBeInstanceOf(Map)
	})
})
