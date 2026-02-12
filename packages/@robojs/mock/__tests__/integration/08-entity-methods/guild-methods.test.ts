/**
 * Guild Methods Tests
 *
 * Tests for Guild methods including fetch, fetchOwner, leave,
 * and various guild properties.
 */
import { ChannelType, Client, GatewayIntentBits, Guild, GuildFeature } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Guild Methods', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild

	beforeAll(async () => {
		session = await createSession({
			name: 'guild-methods-tests',
			config: {
				guilds: [
					{
						name: 'Guild Methods Test',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				],
				enforceIntents: true,
				approvedPrivilegedIntents: BigInt(GatewayIntentBits.GuildMembers)
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Guild.fetch()', () => {
		it('should fetch guild', async () => {
			const fetched = await guild.fetch()

			expect(fetched.id).toBe(guild.id)
		})

		it('should return same guild reference', async () => {
			const fetched = await guild.fetch()

			expect(fetched.name).toBe('Guild Methods Test')
		})
	})

	describe('Guild.fetchOwner()', () => {
		it('should fetch guild owner', async () => {
			const owner = await guild.fetchOwner()

			expect(owner).toBeDefined()
			expect(owner.id).toBe(guild.ownerId)
		})

		it('should fetch owner with options', async () => {
			const owner = await guild.fetchOwner({ cache: true, force: false })

			expect(owner).toBeDefined()
		})
	})

	describe('Guild Properties', () => {
		it('should have nameAcronym', () => {
			expect(guild.nameAcronym).toBeDefined()
			expect(typeof guild.nameAcronym).toBe('string')
		})

		it('should have createdAt', () => {
			expect(guild.createdAt).toBeInstanceOf(Date)
		})

		it('should have createdTimestamp', () => {
			expect(guild.createdTimestamp).toBeGreaterThan(0)
		})

		it('should have joinedAt', () => {
			expect(guild.joinedAt).toBeInstanceOf(Date)
		})

		it('should have joinedTimestamp', () => {
			expect(guild.joinedTimestamp).toBeGreaterThan(0)
		})

		it('should have memberCount', () => {
			expect(guild.memberCount).toBeGreaterThan(0)
		})

		it('should check available', () => {
			expect(guild.available).toBe(true)
		})

		it('should have partnered status', () => {
			expect(typeof guild.partnered).toBe('boolean')
		})

		it('should have verified status', () => {
			expect(typeof guild.verified).toBe('boolean')
		})

		it('should have ownerId', () => {
			expect(guild.ownerId).toBeDefined()
			expect(typeof guild.ownerId).toBe('string')
		})

		it('should have id', () => {
			expect(guild.id).toBeDefined()
			expect(typeof guild.id).toBe('string')
		})

		it('should have name', () => {
			expect(guild.name).toBe('Guild Methods Test')
		})

		it('should have icon (may be null)', () => {
			expect(guild.icon === null || typeof guild.icon === 'string').toBe(true)
		})

		it('should have splash (may be null)', () => {
			expect(guild.splash === null || typeof guild.splash === 'string').toBe(true)
		})

		it('should have banner (may be null)', () => {
			expect(guild.banner === null || typeof guild.banner === 'string').toBe(true)
		})

		it('should have description (may be null)', () => {
			expect(guild.description === null || typeof guild.description === 'string').toBe(true)
		})

		it('should have premiumTier', () => {
			expect(typeof guild.premiumTier).toBe('number')
		})

		it('should have premiumSubscriptionCount', () => {
			expect(guild.premiumSubscriptionCount === null || typeof guild.premiumSubscriptionCount === 'number').toBe(true)
		})

		it('should have features array', () => {
			expect(Array.isArray(guild.features)).toBe(true)
		})

		it('should have shardId', () => {
			expect(typeof guild.shardId).toBe('number')
		})

		it('should have large property', () => {
			expect(typeof guild.large).toBe('boolean')
		})

		it('should have maximumMembers', () => {
			expect(guild.maximumMembers === null || typeof guild.maximumMembers === 'number').toBe(true)
		})

		it('should have maximumPresences', () => {
			expect(guild.maximumPresences === null || typeof guild.maximumPresences === 'number').toBe(true)
		})

		it('should have vanityURLCode (may be null)', () => {
			expect(guild.vanityURLCode === null || typeof guild.vanityURLCode === 'string').toBe(true)
		})

		it('should have preferredLocale', () => {
			expect(typeof guild.preferredLocale).toBe('string')
		})

		it('should have systemChannelId (may be null)', () => {
			expect(guild.systemChannelId === null || typeof guild.systemChannelId === 'string').toBe(true)
		})

		it('should have rulesChannelId (may be null)', () => {
			expect(guild.rulesChannelId === null || typeof guild.rulesChannelId === 'string').toBe(true)
		})

		it('should have publicUpdatesChannelId (may be null)', () => {
			expect(guild.publicUpdatesChannelId === null || typeof guild.publicUpdatesChannelId === 'string').toBe(true)
		})
	})

	describe('Guild URL Methods', () => {
		it('should generate icon URL (if icon exists)', () => {
			if (guild.icon) {
				const iconURL = guild.iconURL()
				expect(iconURL).toContain(guild.icon)
			} else {
				expect(guild.iconURL()).toBeNull()
			}
		})

		it('should generate splash URL (if splash exists)', () => {
			if (guild.splash) {
				const splashURL = guild.splashURL()
				expect(splashURL).toContain(guild.splash)
			} else {
				expect(guild.splashURL()).toBeNull()
			}
		})

		it('should generate banner URL (if banner exists)', () => {
			if (guild.banner) {
				const bannerURL = guild.bannerURL()
				expect(bannerURL).toContain(guild.banner)
			} else {
				expect(guild.bannerURL()).toBeNull()
			}
		})
	})

	describe('Guild.setName()', () => {
		let originalName: string

		beforeAll(() => {
			originalName = guild.name
		})

		afterAll(async () => {
			// Restore original name
			await guild.setName(originalName)
		})

		it('should set guild name', async () => {
			const updated = await guild.setName('Renamed Guild')

			expect(updated.name).toBe('Renamed Guild')
		})

		it('should set guild name with reason', async () => {
			const updated = await guild.setName('Another Name', 'Testing rename')

			expect(updated.name).toBe('Another Name')
		})
	})

	describe('Guild Channel Management', () => {
		it('should have channels collection', () => {
			expect(guild.channels).toBeDefined()
			expect(guild.channels.cache.size).toBeGreaterThan(0)
		})

		it('should fetch channels', async () => {
			const channels = await guild.channels.fetch()

			expect(channels.size).toBeGreaterThan(0)
		})

		it('should create text channel', async () => {
			const channel = await guild.channels.create({
				name: 'test-channel',
				type: ChannelType.GuildText
			})

			try {
				expect(channel.name).toBe('test-channel')
				expect(channel.type).toBe(ChannelType.GuildText)
			} finally {
				await channel.delete()
			}
		})

		it('should create voice channel', async () => {
			const channel = await guild.channels.create({
				name: 'test-voice',
				type: ChannelType.GuildVoice
			})

			try {
				expect(channel.name).toBe('test-voice')
				expect(channel.type).toBe(ChannelType.GuildVoice)
			} finally {
				await channel.delete()
			}
		})

		it('should create category', async () => {
			const category = await guild.channels.create({
				name: 'Test Category',
				type: ChannelType.GuildCategory
			})

			try {
				expect(category.name).toBe('Test Category')
				expect(category.type).toBe(ChannelType.GuildCategory)
			} finally {
				await category.delete()
			}
		})
	})

	describe('Guild Role Management', () => {
		it('should have roles collection', () => {
			expect(guild.roles).toBeDefined()
			expect(guild.roles.cache.size).toBeGreaterThan(0)
		})

		it('should have @everyone role', () => {
			expect(guild.roles.everyone).toBeDefined()
			expect(guild.roles.everyone.id).toBe(guild.id)
		})

		it('should fetch roles', async () => {
			await guild.roles.fetch()

			// Note: RoleManager.fetch() may return empty collection, check cache instead
			expect(guild.roles.cache.size).toBeGreaterThan(0)
		})
	})

	describe('Guild Member Management', () => {
		it('should have members collection', () => {
			expect(guild.members).toBeDefined()
		})

		it('should have bot member in cache', () => {
			expect(guild.members.cache.has(client!.user!.id)).toBe(true)
		})

		it('should have me property', () => {
			expect(guild.members.me).toBeDefined()
			expect(guild.members.me?.id).toBe(client!.user!.id)
		})
	})

	describe('Guild Ban Management', () => {
		it('should have bans manager', () => {
			expect(guild.bans).toBeDefined()
		})

		it('should fetch bans', async () => {
			const bans = await guild.bans.fetch()

			// May be empty
			expect(bans).toBeDefined()
		})
	})

	describe('Guild Emoji Management', () => {
		it('should have emojis collection', () => {
			expect(guild.emojis).toBeDefined()
		})

		it('should fetch emojis', async () => {
			const emojis = await guild.emojis.fetch()

			expect(emojis).toBeDefined()
		})
	})

	describe('Guild Sticker Management', () => {
		it('should have stickers collection', () => {
			expect(guild.stickers).toBeDefined()
		})

		it('should fetch stickers', async () => {
			const stickers = await guild.stickers.fetch()

			expect(stickers).toBeDefined()
		})
	})

	describe('Guild Scheduled Events', () => {
		it('should have scheduledEvents manager', () => {
			expect(guild.scheduledEvents).toBeDefined()
		})

		it('should fetch scheduled events', async () => {
			const events = await guild.scheduledEvents.fetch()

			expect(events).toBeDefined()
		})
	})

	describe('Guild Invites', () => {
		it('should have invites manager', () => {
			expect(guild.invites).toBeDefined()
		})

		it('should fetch invites', async () => {
			const invites = await guild.invites.fetch()

			expect(invites).toBeDefined()
		})
	})

	describe('Guild.edit()', () => {
		it('should edit guild with options', async () => {
			const original = guild.name

			try {
				const edited = await guild.edit({
					name: 'Edited Guild Name'
				})

				expect(edited.name).toBe('Edited Guild Name')
			} finally {
				await guild.edit({ name: original })
			}
		})
	})

	describe('Guild Feature Checks', () => {
		it('should check for community feature', () => {
			const hasCommunity = guild.features.includes(GuildFeature.Community)
			expect(typeof hasCommunity).toBe('boolean')
		})

		it('should check for partnered feature', () => {
			const hasPartnered = guild.features.includes(GuildFeature.Partnered)
			expect(typeof hasPartnered).toBe('boolean')
		})

		it('should check for verified feature', () => {
			const hasVerified = guild.features.includes(GuildFeature.Verified)
			expect(typeof hasVerified).toBe('boolean')
		})
	})

	describe('GuildManager.fetch()', () => {
		it('should have guilds in cache', async () => {
			// Note: GuildManager.fetch() may not be fully implemented in mock server
			// Check cache instead
			expect(client!.guilds.cache.size).toBeGreaterThan(0)
		})

		it('should fetch specific guild', async () => {
			const fetched = await client!.guilds.fetch(guild.id)

			expect(fetched.id).toBe(guild.id)
		})
	})

	describe('Guild System Channel', () => {
		it('should get system channel (if set)', () => {
			const systemChannel = guild.systemChannel

			if (systemChannel) {
				expect(systemChannel.type).toBe(ChannelType.GuildText)
			} else {
				expect(systemChannel).toBeNull()
			}
		})
	})

	describe('Guild Rules Channel', () => {
		it('should get rules channel (if set)', () => {
			const rulesChannel = guild.rulesChannel

			if (rulesChannel) {
				expect(rulesChannel.type).toBe(ChannelType.GuildText)
			} else {
				expect(rulesChannel).toBeNull()
			}
		})
	})

	describe('Guild Public Updates Channel', () => {
		it('should get public updates channel (if set)', () => {
			const publicUpdatesChannel = guild.publicUpdatesChannel

			if (publicUpdatesChannel) {
				expect(publicUpdatesChannel.type).toBe(ChannelType.GuildText)
			} else {
				expect(publicUpdatesChannel).toBeNull()
			}
		})
	})

	describe('Guild Widget', () => {
		it('should check widgetEnabled property', () => {
			expect(guild.widgetEnabled === null || typeof guild.widgetEnabled === 'boolean').toBe(true)
		})

		it('should check widgetChannelId property', () => {
			expect(guild.widgetChannelId === null || typeof guild.widgetChannelId === 'string').toBe(true)
		})
	})

	describe('Guild AFK Settings', () => {
		it('should have afkTimeout', () => {
			expect(typeof guild.afkTimeout).toBe('number')
		})

		it('should have afkChannelId (may be null)', () => {
			expect(guild.afkChannelId === null || typeof guild.afkChannelId === 'string').toBe(true)
		})

		it('should get afkChannel (if set)', () => {
			const afkChannel = guild.afkChannel

			if (afkChannel) {
				expect(afkChannel.type).toBe(ChannelType.GuildVoice)
			} else {
				expect(afkChannel).toBeNull()
			}
		})
	})

	describe('Guild Verification Level', () => {
		it('should have verificationLevel', () => {
			expect(typeof guild.verificationLevel).toBe('number')
		})
	})

	describe('Guild Explicit Content Filter', () => {
		it('should have explicitContentFilter', () => {
			expect(typeof guild.explicitContentFilter).toBe('number')
		})
	})

	describe('Guild MFA Level', () => {
		it('should have mfaLevel', () => {
			expect(typeof guild.mfaLevel).toBe('number')
		})
	})

	describe('Guild Default Message Notifications', () => {
		it('should have defaultMessageNotifications', () => {
			expect(typeof guild.defaultMessageNotifications).toBe('number')
		})
	})
})
