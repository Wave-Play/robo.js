/**
 * Channel Comparisons Tests
 *
 * Tests for channel comparison methods including equals(),
 * isTextBased(), isVoiceBased(), isThread(), and isDMBased().
 */
import { ChannelType, Client, GatewayIntentBits, Guild, TextChannel } from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Channel Comparisons', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'channel-comparisons-tests',
			config: {
				guilds: [
					{
						name: 'Channel Comparisons Test',
						channels: [
							{ name: 'general', type: ChannelType.GuildText },
							{ name: 'voice', type: ChannelType.GuildVoice }
						]
					}
				],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(GatewayIntentBits.GuildMembers)
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.DirectMessages,
			GatewayIntentBits.GuildMembers
		])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Channel.equals()', () => {
		it('should compare channels with equals()', async () => {
			const channel1 = await guild.channels.create({
				name: 'compare-1',
				type: ChannelType.GuildText
			})

			try {
				const channel2 = (await guild.channels.fetch(channel1.id)) as TextChannel | null

				expect(channel1.equals(channel2!)).toBe(true)
			} finally {
				await channel1.delete()
			}
		})

		it('should return false for different channels', async () => {
			const channel1 = await guild.channels.create({
				name: 'diff-1',
				type: ChannelType.GuildText
			})
			const channel2 = await guild.channels.create({
				name: 'diff-2',
				type: ChannelType.GuildText
			})

			try {
				expect(channel1.equals(channel2)).toBe(false)
			} finally {
				await channel1.delete()
				await channel2.delete()
			}
		})
	})

	describe('Channel.isTextBased()', () => {
		it('should return true for text channel', () => {
			const textChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)

			expect(textChannel?.isTextBased()).toBe(true)
		})

		it('should return true for announcement channel', async () => {
			const announcement = await guild.channels.create({
				name: 'announcements',
				type: ChannelType.GuildAnnouncement
			})

			try {
				expect(announcement.isTextBased()).toBe(true)
			} finally {
				await announcement.delete()
			}
		})

		it('should return false for category channel', async () => {
			const category = await guild.channels.create({
				name: 'category',
				type: ChannelType.GuildCategory
			})

			try {
				expect(category.isTextBased()).toBe(false)
			} finally {
				await category.delete()
			}
		})
	})

	describe('Channel.isVoiceBased()', () => {
		it('should return true for voice channel', () => {
			const voiceChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice)

			expect(voiceChannel?.isVoiceBased()).toBe(true)
		})

		it('should return true for stage channel', async () => {
			const stage = await guild.channels.create({
				name: 'stage',
				type: ChannelType.GuildStageVoice
			})

			try {
				expect(stage.isVoiceBased()).toBe(true)
			} finally {
				await stage.delete()
			}
		})

		it('should return false for text channel', () => {
			const textChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)

			expect(textChannel?.isVoiceBased()).toBe(false)
		})
	})

	describe('Channel.isThread()', () => {
		it('should return true for thread channel', async () => {
			const textChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel

			const message = await textChannel.send('Thread check')
			const thread = await message.startThread({ name: 'Check Thread' })

			try {
				expect(thread.isThread()).toBe(true)
			} finally {
				await thread.delete()
			}
		})

		it('should return false for text channel', () => {
			const textChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)

			expect(textChannel?.isThread()).toBe(false)
		})

		it('should return false for voice channel', () => {
			const voiceChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice)

			expect(voiceChannel?.isThread()).toBe(false)
		})
	})

	describe('Channel.isDMBased()', () => {
		it('should return true for DM channel', async () => {
			// Create a user and DM channel
			const userId = '888888888888888888'
			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guild.id,
				user: { id: userId, username: 'DMCheck', discriminator: '0', avatar: null },
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})

			const user = await client!.users.fetch(userId)
			const dm = await user.createDM()

			expect(dm.isDMBased()).toBe(true)
		})

		it('should return false for text channel', () => {
			const textChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)

			expect(textChannel?.isDMBased()).toBe(false)
		})

		it('should return false for voice channel', () => {
			const voiceChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice)

			expect(voiceChannel?.isDMBased()).toBe(false)
		})
	})

	describe('Channel Type Checks', () => {
		it('should check text channel type', () => {
			const textChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText)

			expect(textChannel?.type).toBe(ChannelType.GuildText)
		})

		it('should check voice channel type', () => {
			const voiceChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice)

			expect(voiceChannel?.type).toBe(ChannelType.GuildVoice)
		})

		it('should check category type', async () => {
			const category = await guild.channels.create({
				name: 'type-check-cat',
				type: ChannelType.GuildCategory
			})

			try {
				expect(category.type).toBe(ChannelType.GuildCategory)
			} finally {
				await category.delete()
			}
		})

		it('should check forum type', async () => {
			const forum = await guild.channels.create({
				name: 'type-check-forum',
				type: ChannelType.GuildForum
			})

			try {
				expect(forum.type).toBe(ChannelType.GuildForum)
			} finally {
				await forum.delete()
			}
		})
	})

	describe('Voice-based Text Properties', () => {
		it('should be text-based for voice channel (voice chat)', () => {
			const voiceChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildVoice)

			// Voice channels in Discord also support text chat
			expect(voiceChannel?.isTextBased()).toBe(true)
		})
	})
})
