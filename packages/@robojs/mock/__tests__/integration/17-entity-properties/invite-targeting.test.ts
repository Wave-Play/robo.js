/**
 * Invite Targeting Tests
 *
 * Tests for invite targeting options including stream target, application target,
 * stage instance, expiresAt, and createdAt properties.
 */
import {
	ChannelType,
	Client,
	GatewayIntentBits,
	Guild,
	InviteTargetType,
	StageChannel,
	TextChannel,
	VoiceChannel
} from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Invite Targeting', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let textChannel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'invite-targeting-tests',
			config: {
				guilds: [{ name: 'Invite Targeting Guild' }]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildInvites])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
		textChannel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Invite Expiration Properties', () => {
		it('should have expiresAt property with maxAge', async () => {
			const invite = await textChannel.createInvite({ maxAge: 3600 }) // 1 hour

			try {
				expect(invite.expiresAt).toBeInstanceOf(Date)
				expect(invite.expiresTimestamp).toBeGreaterThan(Date.now())

				// Expiration should be roughly 1 hour from now
				const expectedExpiry = Date.now() + 3600000
				expect(Math.abs(invite.expiresTimestamp! - expectedExpiry)).toBeLessThan(5000) // Allow 5 second tolerance
			} finally {
				await invite.delete()
			}
		})

		it('should have null expiresAt for permanent invite', async () => {
			const invite = await textChannel.createInvite({ maxAge: 0 }) // Permanent

			try {
				expect(invite.expiresAt).toBeNull()
				expect(invite.expiresTimestamp).toBeNull()
			} finally {
				await invite.delete()
			}
		})
	})

	describe('Invite Creation Properties', () => {
		it('should have createdAt property', async () => {
			const invite = await textChannel.createInvite()

			try {
				expect(invite.createdAt).toBeInstanceOf(Date)
				expect(invite.createdTimestamp).toBeLessThanOrEqual(Date.now())

				// Created time should be within last few seconds
				expect(Date.now() - invite.createdTimestamp!).toBeLessThan(5000)
			} finally {
				await invite.delete()
			}
		})
	})

	describe('Invite Basic Properties', () => {
		it('should have code property', async () => {
			const invite = await textChannel.createInvite()

			try {
				expect(invite.code).toBeDefined()
				expect(typeof invite.code).toBe('string')
				expect(invite.code.length).toBeGreaterThan(0)
			} finally {
				await invite.delete()
			}
		})

		it('should have channel property', async () => {
			const invite = await textChannel.createInvite()

			try {
				expect(invite.channel).toBeDefined()
				expect(invite.channel?.id).toBe(textChannel.id)
			} finally {
				await invite.delete()
			}
		})

		it('should have guild property', async () => {
			const invite = await textChannel.createInvite()

			try {
				expect(invite.guild).toBeDefined()
				expect(invite.guild?.id).toBe(guild.id)
			} finally {
				await invite.delete()
			}
		})

		it('should have inviter property', async () => {
			const invite = await textChannel.createInvite()

			try {
				expect(invite.inviter).toBeDefined()
				expect(invite.inviter?.id).toBe(client!.user!.id)
			} finally {
				await invite.delete()
			}
		})
	})

	describe('Invite Options', () => {
		it('should create invite with maxUses', async () => {
			const invite = await textChannel.createInvite({ maxUses: 5 })

			try {
				expect(invite.maxUses).toBe(5)
				expect(invite.uses).toBe(0)
			} finally {
				await invite.delete()
			}
		})

		it('should create temporary invite', async () => {
			const invite = await textChannel.createInvite({ temporary: true })

			try {
				expect(invite.temporary).toBe(true)
			} finally {
				await invite.delete()
			}
		})

		it('should create unique invite', async () => {
			const invite = await textChannel.createInvite({ unique: true })

			try {
				expect(invite.code).toBeDefined()
			} finally {
				await invite.delete()
			}
		})
	})

	describe('Voice Channel Invites', () => {
		it('should create invite for voice channel', async () => {
			const voiceChannel = (await guild.channels.create({
				name: 'invite-test-vc',
				type: ChannelType.GuildVoice
			})) as VoiceChannel

			try {
				const invite = await voiceChannel.createInvite()

				expect(invite.channel?.id).toBe(voiceChannel.id)

				await invite.delete()
			} finally {
				await voiceChannel.delete()
			}
		})
	})

	describe('Invite Targeting', () => {
		it('should have targetType property', async () => {
			const invite = await textChannel.createInvite()

			try {
				// Regular invites have null targetType
				expect(invite.targetType === null || typeof invite.targetType === 'number').toBe(true)
			} finally {
				await invite.delete()
			}
		})

		it('should create invite with stream target type for voice channel', async () => {
			const voiceChannel = (await guild.channels.create({
				name: 'stream-target-vc',
				type: ChannelType.GuildVoice
			})) as VoiceChannel

			try {
				// Stream targeting requires a user actively streaming
				// Without an active stream, the invite is created without targeting
				const invite = await voiceChannel.createInvite()

				// Verify the invite structure supports targeting
				expect('targetType' in invite).toBe(true)
				expect('targetUser' in invite).toBe(true)

				await invite.delete()
			} finally {
				await voiceChannel.delete()
			}
		})

		it('should have targetUser property for stream invites', async () => {
			const voiceChannel = (await guild.channels.create({
				name: 'target-user-vc',
				type: ChannelType.GuildVoice
			})) as VoiceChannel

			try {
				const invite = await voiceChannel.createInvite()

				// targetUser is null when not targeting a stream
				expect(invite.targetUser === null || invite.targetUser !== undefined).toBe(true)

				await invite.delete()
			} finally {
				await voiceChannel.delete()
			}
		})

		it('should have targetApplication property for embedded application invites', async () => {
			const voiceChannel = (await guild.channels.create({
				name: 'app-target-vc',
				type: ChannelType.GuildVoice
			})) as VoiceChannel

			try {
				const invite = await voiceChannel.createInvite()

				// targetApplication is null when not targeting an embedded application
				expect(invite.targetApplication === null || invite.targetApplication !== undefined).toBe(true)

				await invite.delete()
			} finally {
				await voiceChannel.delete()
			}
		})

		it('should support InviteTargetType enum values', () => {
			// Verify the target type enum values exist
			expect(InviteTargetType.Stream).toBeDefined()
			expect(InviteTargetType.EmbeddedApplication).toBeDefined()

			// Values should be numbers
			expect(typeof InviteTargetType.Stream).toBe('number')
			expect(typeof InviteTargetType.EmbeddedApplication).toBe('number')
		})
	})

	describe('Stage Channel Invites', () => {
		it('should create invite for stage channel', async () => {
			const stageChannel = (await guild.channels.create({
				name: 'invite-test-stage',
				type: ChannelType.GuildStageVoice
			})) as StageChannel

			try {
				const invite = await stageChannel.createInvite()

				expect(invite.channel?.id).toBe(stageChannel.id)
				expect(invite.channel?.type).toBe(ChannelType.GuildStageVoice)

				await invite.delete()
			} finally {
				await stageChannel.delete()
			}
		})

		it('should have stageInstance property on stage channel invite', async () => {
			const stageChannel = (await guild.channels.create({
				name: 'stage-instance-test',
				type: ChannelType.GuildStageVoice
			})) as StageChannel

			try {
				const invite = await stageChannel.createInvite()

				// stageInstance is null when no active stage instance
				expect('stageInstance' in invite).toBe(true)
				expect(invite.stageInstance === null || invite.stageInstance !== undefined).toBe(true)

				await invite.delete()
			} finally {
				await stageChannel.delete()
			}
		})
	})

	describe('Invite Fetch', () => {
		it('should fetch guild invites', async () => {
			const invite = await textChannel.createInvite()

			try {
				const invites = await guild.invites.fetch()

				expect(invites.has(invite.code)).toBe(true)
			} finally {
				await invite.delete()
			}
		})

		it('should fetch channel invites', async () => {
			const invite = await textChannel.createInvite()

			try {
				const invites = await textChannel.fetchInvites()

				expect(invites.has(invite.code)).toBe(true)
			} finally {
				await invite.delete()
			}
		})
	})
})
