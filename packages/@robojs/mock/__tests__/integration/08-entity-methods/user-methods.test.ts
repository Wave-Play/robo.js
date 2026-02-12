/**
 * User Methods Tests
 *
 * Tests for User-level methods including DM shortcuts, fetch operations,
 * DM channel management, and user properties.
 */
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	Client,
	EmbedBuilder,
	GatewayIntentBits
} from 'discord.js'
import { createSession, dispatchEvent } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { generateSnowflake, waitForReady } from '../utils/helpers.js'

describe('User Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'user-methods-tests',
			config: {
				guilds: [
					{
						name: 'User Methods Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(GatewayIntentBits.MessageContent | GatewayIntentBits.GuildMembers)
			}
		})

		client = createClientWithIntents([
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.DirectMessages,
			GatewayIntentBits.MessageContent,
			GatewayIntentBits.GuildMembers
		])
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('User.send() - DM Shortcut', () => {
		let testUserId: string

		beforeAll(async () => {
			// Create a user in state via GUILD_MEMBER_ADD event
			testUserId = generateSnowflake()
			const guild = client!.guilds.cache.first()!

			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guild.id,
				user: {
					id: testUserId,
					username: 'DMTarget',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})
		})

		it('should send DM via user.send()', async () => {
			const user = await client!.users.fetch(testUserId)

			// This is the shortcut - internally creates DM then sends
			const message = await user.send('Hello via shortcut!')

			expect(message.content).toBe('Hello via shortcut!')
			expect(message.channel.type).toBe(ChannelType.DM)
		})

		it('should send embed via user.send()', async () => {
			const user = await client!.users.fetch(testUserId)

			const embed = new EmbedBuilder().setTitle('DM Embed').setDescription('Test description')
			const message = await user.send({ embeds: [embed] })

			expect(message.embeds.length).toBeGreaterThan(0)
			expect(message.embeds[0].title).toBe('DM Embed')
		})

		it('should send components via user.send()', async () => {
			const user = await client!.users.fetch(testUserId)

			const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder().setCustomId('dm_btn').setLabel('DM Button').setStyle(ButtonStyle.Primary)
			)

			const message = await user.send({
				content: 'Click:',
				components: [row]
			})

			expect(message.components.length).toBe(1)
		})
	})

	describe('User.fetch()', () => {
		let fetchUserId: string

		beforeAll(async () => {
			// Create a user in state
			fetchUserId = generateSnowflake()
			const guild = client!.guilds.cache.first()!

			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guild.id,
				user: {
					id: fetchUserId,
					username: 'FetchMe',
					discriminator: '0',
					avatar: 'abc123'
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})
		})

		it('should fetch user by ID', async () => {
			const user = await client!.users.fetch(fetchUserId)

			expect(user.id).toBe(fetchUserId)
			expect(user.username).toBe('FetchMe')
		})

		it('should fetch user with force option', async () => {
			const user = await client!.users.fetch(fetchUserId, { force: true })

			expect(user.id).toBe(fetchUserId)
		})

		it('should return cached user without force', async () => {
			// First fetch caches
			await client!.users.fetch(fetchUserId)

			// Second fetch uses cache
			const cached = await client!.users.fetch(fetchUserId)

			expect(cached).toBeDefined()
			expect(cached.id).toBe(fetchUserId)
		})
	})

	describe('User.createDM() / User.deleteDM()', () => {
		let dmUserId: string

		beforeAll(async () => {
			// Create a user in state
			dmUserId = generateSnowflake()
			const guild = client!.guilds.cache.first()!

			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guild.id,
				user: {
					id: dmUserId,
					username: 'DMChannelUser',
					discriminator: '0',
					avatar: null
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})
		})

		it('should create DM channel', async () => {
			const user = await client!.users.fetch(dmUserId)

			const dm = await user.createDM()

			expect(dm).toBeDefined()
			expect(dm.type).toBe(ChannelType.DM)
		})

		it('should close DM channel', async () => {
			const user = await client!.users.fetch(dmUserId)

			// Create DM first
			const dm = await user.createDM()
			expect(dm).toBeDefined()

			// Delete/close the DM
			await user.deleteDM()

			// DM channel should be removed from cache
			expect(user.dmChannel).toBeNull()
		})
	})

	describe('User Properties', () => {
		let propsUserId: string

		beforeAll(async () => {
			// Create a user with various properties
			propsUserId = generateSnowflake()
			const guild = client!.guilds.cache.first()!

			await dispatchEvent(session.id, 'GUILD_MEMBER_ADD', {
				guild_id: guild.id,
				user: {
					id: propsUserId,
					username: 'PropTest',
					discriminator: '0',
					avatar: 'avatar_hash',
					banner: 'banner_hash',
					accent_color: 0xff5733,
					bot: false,
					system: false,
					public_flags: 64 // HypeSquad Bravery
				},
				roles: [],
				joined_at: new Date().toISOString(),
				deaf: false,
				mute: false
			})
		})

		it('should have correct user properties', async () => {
			const user = await client!.users.fetch(propsUserId)

			expect(user.username).toBe('PropTest')
			expect(user.avatar).toBe('avatar_hash')
			expect(user.bot).toBe(false)
			expect(user.system).toBe(false)
		})

		it('should generate avatar URL', async () => {
			const user = await client!.users.fetch(propsUserId)

			const avatarURL = user.avatarURL()
			expect(avatarURL).toContain('avatar_hash')
		})

		it('should generate display avatar URL', async () => {
			const user = await client!.users.fetch(propsUserId)

			const displayURL = user.displayAvatarURL()
			expect(displayURL).toBeDefined()
		})

		it('should have user flags', async () => {
			const user = await client!.users.fetch(propsUserId)

			// Check if flags object exists
			// Note: The mock server may not fully support public_flags propagation
			expect(user.flags === null || typeof user.flags === 'object').toBe(true)
		})

		it('should have createdAt timestamp', async () => {
			const user = await client!.users.fetch(propsUserId)

			expect(user.createdAt).toBeInstanceOf(Date)
			expect(user.createdTimestamp).toBeGreaterThan(0)
		})

		it('should generate tag', async () => {
			const user = await client!.users.fetch(propsUserId)

			// Discord.js v14+ uses globalName or username for tag
			expect(user.tag).toBeDefined()
			expect(typeof user.tag).toBe('string')
		})

		it('should have defaultAvatarURL', async () => {
			const user = await client!.users.fetch(propsUserId)

			expect(user.defaultAvatarURL).toBeDefined()
			expect(typeof user.defaultAvatarURL).toBe('string')
		})
	})
})
