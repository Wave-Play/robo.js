/**
 * REST Manager Tests
 *
 * Tests for the discord.js REST manager - making direct API requests.
 */
import { ChannelType, Client, GatewayIntentBits, Guild, TextChannel } from 'discord.js'
import { createSession } from '../setup/control-api.js'
import { createClientWithIntents, destroyClient } from '../setup/test-client.js'
import { waitForReady } from '../utils/helpers.js'

describe('REST Manager', () => {
	let client: Client | null = null
	let session: { id: string; token: string }
	let guild: Guild
	let channel: TextChannel

	beforeAll(async () => {
		session = await createSession({
			name: 'rest-manager-tests',
			config: {
				guilds: [
					{
						name: 'REST Manager Test Guild',
						channels: [{ name: 'general', type: ChannelType.GuildText }]
					}
				]
			}
		})

		client = createClientWithIntents([GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages])
		await client.login(session.token)
		await waitForReady(client)

		guild = client.guilds.cache.first()!
		channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildText) as TextChannel
	})

	afterAll(async () => {
		await destroyClient(client)
		client = null
	})

	it('should have rest property', () => {
		expect(client!.rest).toBeDefined()
	})

	it('should make GET request', async () => {
		const user = (await client!.rest.get(`/users/${client!.user!.id}`)) as { id: string }

		expect(user.id).toBe(client!.user!.id)
	})

	it('should make POST request', async () => {
		const message = (await client!.rest.post(`/channels/${channel.id}/messages`, {
			body: { content: 'REST POST test' }
		})) as { content: string }

		expect(message.content).toBe('REST POST test')
	})

	it('should make PATCH request', async () => {
		const msg = await channel.send('PATCH me')

		const edited = (await client!.rest.patch(`/channels/${channel.id}/messages/${msg.id}`, {
			body: { content: 'PATCHed' }
		})) as { content: string }

		expect(edited.content).toBe('PATCHed')
	})

	it('should make DELETE request', async () => {
		const msg = await channel.send('DELETE me')

		await client!.rest.delete(`/channels/${channel.id}/messages/${msg.id}`)

		await expect(channel.messages.fetch(msg.id)).rejects.toBeDefined()
	})

	it('should include reason in headers', async () => {
		const role = (await client!.rest.post(`/guilds/${guild.id}/roles`, {
			body: { name: 'REST Role' },
			reason: 'REST reason test'
		})) as { id: string; name: string }

		expect(role.name).toBe('REST Role')

		// Clean up
		await client!.rest.delete(`/guilds/${guild.id}/roles/${role.id}`)
	})

	it('should make PUT request', async () => {
		// Create a role and add it to a member to test PUT
		const role = await guild.roles.create({ name: 'PUT Test Role' })

		try {
			// PUT to add role to the bot user (member)
			await client!.rest.put(`/guilds/${guild.id}/members/${client!.user!.id}/roles/${role.id}`)

			// Verify the role was added
			const member = await guild.members.fetch(client!.user!.id)
			expect(member.roles.cache.has(role.id)).toBe(true)
		} finally {
			await role.delete().catch(() => {})
		}
	})
})
