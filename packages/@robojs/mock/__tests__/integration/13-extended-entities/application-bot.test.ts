/**
 * Application & Bot User Tests
 *
 * Tests for client.application and client.user including
 * application fetch, owner, flags, and bot user methods.
 */
import { ChannelType, Client, GatewayIntentBits } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('Application & Bot User', () => {
	let client: Client | null = null
	let session: { id: string; token: string }

	beforeAll(async () => {
		session = await createSession({
			name: 'application-bot-tests',
			config: {
				botUser: { username: 'TestBot' },
				guilds: [
					{
						name: 'Application Test',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds])
		await client.login(session.token)
		await waitForReady(client)
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	describe('Client Application', () => {
		it('should have application', () => {
			expect(client!.application).toBeDefined()
		})

		it('should have application id matching bot user id', () => {
			expect(client!.application?.id).toBe(client!.user?.id)
		})

		it('should fetch application', async () => {
			const app = await client!.application!.fetch()

			expect(app.id).toBeDefined()
			expect(app.name).toBeDefined()
		})

		it('should have application name', async () => {
			const app = await client!.application!.fetch()

			expect(typeof app.name).toBe('string')
		})

		it('should have application owner', async () => {
			const app = await client!.application!.fetch()

			// Owner is defined (can be User or Team)
			expect(app.owner).toBeDefined()
		})

		it('should have application flags', async () => {
			const app = await client!.application!.fetch()

			expect(app.flags).toBeDefined()
		})

		it('should have application description', async () => {
			const app = await client!.application!.fetch()

			// Description may be null or string
			expect(app.description === null || typeof app.description === 'string').toBe(true)
		})

		it('should have botPublic property', async () => {
			const app = await client!.application!.fetch()

			expect(typeof app.botPublic).toBe('boolean')
		})

		it('should have botRequireCodeGrant property', async () => {
			const app = await client!.application!.fetch()

			expect(typeof app.botRequireCodeGrant).toBe('boolean')
		})
	})

	describe('Bot User', () => {
		it('should have bot user', () => {
			expect(client!.user).toBeDefined()
		})

		it('should be a bot', () => {
			expect(client!.user!.bot).toBe(true)
		})

		it('should have username', () => {
			expect(client!.user!.username).toBeDefined()
			expect(client!.user!.username).toBe('TestBot')
		})

		it('should have discriminator', () => {
			expect(client!.user!.discriminator).toBeDefined()
		})

		it('should have tag', () => {
			expect(client!.user!.tag).toBeDefined()
			expect(client!.user!.tag).toContain('TestBot')
		})

		it('should have id', () => {
			expect(client!.user!.id).toBeDefined()
			expect(typeof client!.user!.id).toBe('string')
		})

		it('should have avatar (may be null)', () => {
			const avatar = client!.user!.avatar
			expect(avatar === null || typeof avatar === 'string').toBe(true)
		})

		it('should have createdAt', () => {
			expect(client!.user!.createdAt).toBeInstanceOf(Date)
		})

		it('should have createdTimestamp', () => {
			expect(client!.user!.createdTimestamp).toBeGreaterThan(0)
		})
	})

	describe('Bot User Methods', () => {
		let originalUsername: string

		beforeAll(() => {
			originalUsername = client!.user!.username
		})

		afterAll(async () => {
			// Restore original username
			try {
				await client!.user!.setUsername(originalUsername)
			} catch {
				// Ignore errors on cleanup
			}
		})

		it('should set username', async () => {
			await client!.user!.setUsername('NewBotName')

			expect(client!.user!.username).toBe('NewBotName')
		})

		it('should set avatar', async () => {
			// 1x1 transparent PNG
			const avatarData =
				'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

			await client!.user!.setAvatar(avatarData)

			expect(client!.user!.avatar).toBeDefined()
		})

		it('should clear avatar with null', async () => {
			await client!.user!.setAvatar(null)

			expect(client!.user!.avatar).toBeNull()
		})
	})

	describe('Bot User URL Methods', () => {
		it('should generate avatar URL (if avatar exists)', () => {
			const url = client!.user!.avatarURL()

			// May be null if no avatar
			if (client!.user!.avatar) {
				expect(url).toContain(client!.user!.avatar)
			} else {
				expect(url).toBeNull()
			}
		})

		it('should generate display avatar URL', () => {
			const url = client!.user!.displayAvatarURL()

			// Should always return a URL (default avatar if no custom one)
			expect(url).toBeDefined()
			expect(typeof url).toBe('string')
		})

		it('should generate avatar URL with options', () => {
			const url = client!.user!.displayAvatarURL({ size: 256, extension: 'png' })

			// Only contains size if avatar is set; default avatars don't include size
			if (client!.user!.avatar) {
				expect(url).toContain('256')
			} else {
				// Default avatar URL format is expected
				expect(url).toBeDefined()
			}
		})
	})

	describe('Bot Presence', () => {
		it('should have presence', () => {
			expect(client!.user!.presence).toBeDefined()
		})

		it('should set presence', () => {
			client!.user!.setPresence({
				status: 'dnd',
				activities: [{ name: 'Testing' }]
			})

			expect(client!.user!.presence.status).toBe('dnd')
		})

		it('should set status directly', () => {
			client!.user!.setStatus('idle')

			expect(client!.user!.presence.status).toBe('idle')
		})

		it('should set activity', () => {
			client!.user!.setActivity('Playing tests')

			expect(client!.user!.presence.activities[0]?.name).toBe('Playing tests')
		})
	})

	describe('Client User Flags', () => {
		it('should have flags property', () => {
			// Flags may be null or a UserFlags bitfield
			const flags = client!.user!.flags
			expect(flags === null || typeof flags === 'object').toBe(true)
		})
	})

	describe('Bot Display Name', () => {
		it('should have displayName', () => {
			expect(client!.user!.displayName).toBeDefined()
		})

		it('should displayName match username when no global name', () => {
			// Without a global_name, displayName should equal username
			const displayName = client!.user!.displayName
			const username = client!.user!.username

			// displayName is globalName ?? username
			expect(displayName).toBe(client!.user!.globalName ?? username)
		})
	})
})
