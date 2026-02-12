/**
 * Channel CRUD Tests
 *
 * Covers creation, updates, deletion, permission overwrites, and channel events.
 */
import { ChannelType, Client, DiscordAPIError, Events, NonThreadGuildBasedChannel, PermissionFlagsBits, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createTestClient, destroyClient } from '../setup/test-client.js'
import { waitForEvent, waitForReady } from '../utils/helpers.js'

describe('Channel CRUD', () => {
	let client: Client | null = null
	let guildId: string
	let session: { id: string; token: string; guildId: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'channel-crud-tests',
			config: {
				guilds: [{ name: 'Channel CRUD Guild' }]
			}
		})

		client = createTestClient()
		await client.login(session.token)
		await waitForReady(client)

		guildId = client.guilds.cache.first()!.id
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Text Channels', () => {
		it('should create a text channel', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const channel = (await guild.channels.create({
				name: 'test-channel',
				type: ChannelType.GuildText,
				topic: 'Test topic',
				rateLimitPerUser: 5
			})) as TextChannel

			expect(channel.name).toBe('test-channel')
			expect(channel.type).toBe(ChannelType.GuildText)
			expect(channel.topic).toBe('Test topic')

			await channel.delete()
		})

		it('should edit channel properties', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const channel = (await guild.channels.create({
				name: 'edit-test',
				type: ChannelType.GuildText
			})) as TextChannel

			await channel.edit({
				name: 'renamed',
				topic: 'Updated',
				nsfw: true
			})

			expect(channel.name).toBe('renamed')
			expect(channel.topic).toBe('Updated')
			expect(channel.nsfw).toBe(true)

			await channel.delete()
		})

		it('should delete channel', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const channel = await guild.channels.create({
				name: 'delete-test',
				type: ChannelType.GuildText
			})
			const channelId = channel.id

			await channel.delete()

			await expect(client!.channels.fetch(channelId)).rejects.toBeInstanceOf(DiscordAPIError)
		})
	})

	describe('Voice Channels', () => {
		it('should create voice channel', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const channel = await guild.channels.create({
				name: 'test-voice',
				type: ChannelType.GuildVoice,
				bitrate: 64000,
				userLimit: 10
			})

			expect(channel.type).toBe(ChannelType.GuildVoice)
			expect(channel.bitrate).toBe(64000)
			expect(channel.userLimit).toBe(10)

			await channel.delete()
		})

		it('should update voice channel settings', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const channel = await guild.channels.create({
				name: 'voice-update',
				type: ChannelType.GuildVoice
			})

			await channel.edit({ userLimit: 5, bitrate: 48000 })

			expect(channel.userLimit).toBe(5)
			expect(channel.bitrate).toBe(48000)

			await channel.delete()
		})

		it('should set voice channel status', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const channel = await guild.channels.create({
				name: 'status-test',
				type: ChannelType.GuildVoice
			})

			// Use direct REST API to set voice channel status
			const setStatusResponse = await fetch(
				`http://localhost:3000/api/v10/channels/${channel.id}/voice-status`,
				{
					method: 'PUT',
					headers: {
						Authorization: `Bot ${session.token}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ status: '🎮 Gaming' })
				}
			)
			expect(setStatusResponse.status).toBe(204)

			// Verify via direct REST fetch
			const channelResponse = await fetch(`http://localhost:3000/api/v10/channels/${channel.id}`, {
				headers: { Authorization: `Bot ${session.token}` }
			})
			const channelData = (await channelResponse.json()) as { status?: string }
			expect(channelData.status).toBe('🎮 Gaming')

			await channel.delete()
		})
	})

	describe('Categories', () => {
		it('should create category with children', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const category = await guild.channels.create({
				name: 'Test Category',
				type: ChannelType.GuildCategory
			})

			const child = (await guild.channels.create({
				name: 'child-channel',
				type: ChannelType.GuildText,
				parent: category.id
			})) as TextChannel

			expect(child.parentId).toBe(category.id)

			await child.delete()
			await category.delete()
		})

		it('should sync permissions with category', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const category = await guild.channels.create({
				name: 'Sync Category',
				type: ChannelType.GuildCategory
			})

			await category.permissionOverwrites.create(guildId, {
				SendMessages: false
			})

			const child = (await guild.channels.create({
				name: 'sync-child',
				type: ChannelType.GuildText,
				parent: category.id
			})) as TextChannel

			await child.lockPermissions()

			const childOverwrite = child.permissionOverwrites.cache.get(guildId)
			expect(childOverwrite?.deny.has(PermissionFlagsBits.SendMessages)).toBe(true)

			await child.delete()
			await category.delete()
		})
	})

	describe('Permission Overwrites', () => {
		it('should add permission overwrite', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const channel = (await guild.channels.create({
				name: 'perm-test',
				type: ChannelType.GuildText
			})) as TextChannel

			await channel.permissionOverwrites.create(client!.user!.id, {
				SendMessages: false,
				ViewChannel: true
			})

			const overwrite = channel.permissionOverwrites.cache.get(client!.user!.id)
			expect(overwrite!.deny.has(PermissionFlagsBits.SendMessages)).toBe(true)
			expect(overwrite!.allow.has(PermissionFlagsBits.ViewChannel)).toBe(true)

			await channel.delete()
		})
	})

	describe('Channel Events', () => {
		it('should emit ChannelCreate event', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const eventPromise = waitForEvent(client!, Events.ChannelCreate)

			const channel = await guild.channels.create({
				name: 'event-test',
				type: ChannelType.GuildText
			})

			const created = await eventPromise
			expect(created.id).toBe(channel.id)

			await channel.delete()
		})

		it('should emit ChannelUpdate event', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const channel = (await guild.channels.create({
				name: 'update-event',
				type: ChannelType.GuildText
			})) as TextChannel

			const eventPromise = new Promise<{ oldName: string; newName: string }>((resolve) => {
				client!.once(Events.ChannelUpdate, (oldChannel, updatedChannel) => {
					// Cast to NonThreadGuildBasedChannel since we know this is a guild channel
					const oldCh = oldChannel as NonThreadGuildBasedChannel
					const newCh = updatedChannel as NonThreadGuildBasedChannel
					resolve({ oldName: oldCh.name, newName: newCh.name })
				})
			})

			await channel.edit({ name: 'updated' })

			const { oldName, newName } = await eventPromise
			expect(oldName).toBe('update-event')
			expect(newName).toBe('updated')

			await channel.delete()
		})

		it('should emit ChannelDelete event', async () => {
			const guild = client!.guilds.cache.get(guildId)!
			const channel = await guild.channels.create({
				name: 'delete-event',
				type: ChannelType.GuildText
			})
			const channelId = channel.id

			const eventPromise = waitForEvent(client!, Events.ChannelDelete)
			await channel.delete()

			const deleted = await eventPromise
			expect(deleted.id).toBe(channelId)
		})
	})
})

