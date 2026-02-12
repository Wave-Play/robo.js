/**
 * VoiceChannel Members Collection Tests
 *
 * Tests for VoiceChannel members collection, tracking members in voice,
 * full property, and joinable property.
 */
import { ChannelType, Client, Collection, GatewayIntentBits, Guild, GuildMember, VoiceChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady, delay } from '../utils/helpers.js'

describe('VoiceChannel Members Collection', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let voiceChannel: VoiceChannel
	let guildId: string

	beforeAll(async () => {
		session = await createSession({
			name: 'voice-channel-members-tests',
			config: {
				guilds: [
					{
						name: 'VC Members Test Guild',
						channels: [
							{ name: 'general', type: ChannelType.GuildText },
							{ name: 'vc-members', type: ChannelType.GuildVoice }
						]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
		guildId = guild.id
		voiceChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice) as VoiceChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	/**
	 * Helper to add a member to the guild and put them in a voice channel
	 */
	async function addMemberToVoice(userId: string, channelId: string): Promise<void> {
		// Add member to guild
		await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
			guild_id: guildId,
			user: {
				id: userId,
				username: `VCMember_${userId.slice(-4)}`,
				discriminator: '0000',
				avatar: null,
				bot: false
			},
			roles: [],
			joined_at: new Date().toISOString(),
			deaf: false,
			mute: false
		})

		// Put member in voice channel
		await dispatchEvent(session.id, 'VOICE_STATE_UPDATE', {
			guild_id: guildId,
			channel_id: channelId,
			user_id: userId,
			session_id: generateSnowflake(),
			deaf: false,
			mute: false,
			self_deaf: false,
			self_mute: false,
			self_video: false,
			self_stream: false,
			suppress: false,
			request_to_speak_timestamp: null
		})

		// Wait for cache update
		await delay(100)
	}

	describe('Members Collection', () => {
		it('should have members collection', () => {
			expect(voiceChannel.members).toBeDefined()
			expect(voiceChannel.members).toBeInstanceOf(Collection)
		})

		it('should track members in voice channel', async () => {
			const member1Id = generateSnowflake()
			const member2Id = generateSnowflake()

			await addMemberToVoice(member1Id, voiceChannel.id)
			await addMemberToVoice(member2Id, voiceChannel.id)

			// Verify members are tracked
			expect(voiceChannel.members.size).toBeGreaterThanOrEqual(2)
			expect(voiceChannel.members.has(member1Id)).toBe(true)
			expect(voiceChannel.members.has(member2Id)).toBe(true)
		})

		it('should return GuildMember instances in collection', async () => {
			const memberId = generateSnowflake()
			await addMemberToVoice(memberId, voiceChannel.id)

			const member = voiceChannel.members.get(memberId)
			expect(member).toBeInstanceOf(GuildMember)
			expect(member?.id).toBe(memberId)
		})

		it('should remove member from collection when leaving voice', async () => {
			const memberId = generateSnowflake()
			await addMemberToVoice(memberId, voiceChannel.id)

			// Verify member is in voice
			expect(voiceChannel.members.has(memberId)).toBe(true)

			// Remove member from voice (channel_id = null)
			await dispatchEvent(session.id, 'VOICE_STATE_UPDATE', {
				guild_id: guildId,
				channel_id: null,
				user_id: memberId,
				session_id: generateSnowflake(),
				deaf: false,
				mute: false,
				self_deaf: false,
				self_mute: false
			})

			await delay(100)

			// Verify member is no longer in voice channel members
			expect(voiceChannel.members.has(memberId)).toBe(false)
		})
	})

	describe('Full Property', () => {
		it('should check if channel is full', async () => {
			const limitedVC = (await guild.channels.create({
				name: 'limited-vc',
				type: ChannelType.GuildVoice,
				userLimit: 2
			})) as VoiceChannel

			try {
				// Initially not full
				expect(limitedVC.full).toBe(false)

				// Add members up to limit
				const member1Id = generateSnowflake()
				const member2Id = generateSnowflake()

				await addMemberToVoice(member1Id, limitedVC.id)
				await addMemberToVoice(member2Id, limitedVC.id)

				// Now should be full
				expect(limitedVC.full).toBe(true)
			} finally {
				await limitedVC.delete().catch(() => {})
			}
		})

		it('should not be full when below limit', async () => {
			const limitedVC = (await guild.channels.create({
				name: 'not-full-vc',
				type: ChannelType.GuildVoice,
				userLimit: 5
			})) as VoiceChannel

			try {
				// Add one member
				const memberId = generateSnowflake()
				await addMemberToVoice(memberId, limitedVC.id)

				// Should not be full
				expect(limitedVC.full).toBe(false)
			} finally {
				await limitedVC.delete().catch(() => {})
			}
		})

		it('should return false for unlimited channel', async () => {
			const unlimitedVC = (await guild.channels.create({
				name: 'unlimited-vc',
				type: ChannelType.GuildVoice,
				userLimit: 0 // 0 means unlimited
			})) as VoiceChannel

			try {
				// Add many members
				for (let i = 0; i < 5; i++) {
					const memberId = generateSnowflake()
					await addMemberToVoice(memberId, unlimitedVC.id)
				}

				// Should never be full
				expect(unlimitedVC.full).toBe(false)
			} finally {
				await unlimitedVC.delete().catch(() => {})
			}
		})
	})

	describe('Joinable Property', () => {
		it('should check joinable property for accessible channel', async () => {
			const joinableVC = (await guild.channels.create({
				name: 'joinable-vc',
				type: ChannelType.GuildVoice
			})) as VoiceChannel

			try {
				// Should be joinable by default
				expect(joinableVC.joinable).toBe(true)
			} finally {
				await joinableVC.delete().catch(() => {})
			}
		})

		it('should be joinable and full are independent', async () => {
			// Note: joinable checks permissions, full checks capacity
			// A channel can be both joinable (has permissions) and full (at capacity)
			const limitedVC = (await guild.channels.create({
				name: 'limited-vc-joinable',
				type: ChannelType.GuildVoice,
				userLimit: 1
			})) as VoiceChannel

			try {
				// Add member to fill it
				const memberId = generateSnowflake()
				await addMemberToVoice(memberId, limitedVC.id)

				// Channel is full
				expect(limitedVC.full).toBe(true)
				// joinable checks permissions, not capacity
				expect(typeof limitedVC.joinable).toBe('boolean')
			} finally {
				await limitedVC.delete().catch(() => {})
			}
		})
	})

	describe('User Limit Property', () => {
		it('should have correct userLimit property', async () => {
			const limitedVC = (await guild.channels.create({
				name: 'user-limit-vc',
				type: ChannelType.GuildVoice,
				userLimit: 10
			})) as VoiceChannel

			try {
				expect(limitedVC.userLimit).toBe(10)
			} finally {
				await limitedVC.delete().catch(() => {})
			}
		})

		it('should have 0 userLimit for unlimited channel', async () => {
			const unlimitedVC = (await guild.channels.create({
				name: 'no-limit-vc',
				type: ChannelType.GuildVoice,
				userLimit: 0
			})) as VoiceChannel

			try {
				expect(unlimitedVC.userLimit).toBe(0)
			} finally {
				await unlimitedVC.delete().catch(() => {})
			}
		})
	})
})
