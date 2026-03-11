/**
 * Webhooks Tests
 * Tests the webhook CRUD operations and execution:
 * - POST /channels/:id/webhooks (create)
 * - GET /channels/:id/webhooks (list)
 * - GET /guilds/:id/webhooks (list)
 * - GET/PATCH/DELETE /webhooks/:id (by ID, with auth)
 * - GET/PATCH/DELETE/POST /webhooks/:id/:token (with token, no auth)
 * - GET/PATCH/DELETE /webhooks/:id/:token/messages/:messageId
 */
import { Session } from '../src/session/session.js'
import { sessionManager } from '../src/core/manager.js'
import { createMockChannel } from '../src/session/state.js'
import type { MockWebhook } from '../src/types/index.js'
import { WebhookLimits, WebhookType } from '../src/types/index.js'

// Import handlers directly for unit testing
import channelWebhooksHandler from '../src/api/v10/channels/[id]/webhooks.js'
import guildWebhooksHandler from '../src/api/v10/guilds/[id]/webhooks.js'
import { GET as webhookGetById, PATCH as webhookPatchById, DELETE as webhookDeleteById } from '../src/api/v10/webhooks/[id].js'
import { GET as webhookTokenGet, PATCH as webhookTokenPatch, DELETE as webhookTokenDelete, POST as webhookTokenPost } from '../src/api/v10/webhooks/[app_id]/[token].js'
import { GET as webhookMessageGet, PATCH as webhookMessagePatch, DELETE as webhookMessageDelete } from '../src/api/v10/webhooks/[app_id]/[token]/messages/[messageId].js'

// Local routing wrapper for tests that replicate the old default export behavior
async function webhookWithTokenHandler(request: { method: string; [key: string]: unknown }): Promise<unknown> {
	switch (request.method) {
		case 'GET':
			return webhookTokenGet(request as never)
		case 'PATCH':
			return webhookTokenPatch(request as never)
		case 'DELETE':
			return webhookTokenDelete(request as never)
		case 'POST':
			return webhookTokenPost(request as never)
		default:
			return new Response(null, { status: 405 })
	}
}

// Helper to create a mock RoboRequest
function createMockRequest(options: {
	method: string
	params: Record<string, string>
	body?: unknown
	headers?: Record<string, string>
	url?: string
}): {
	method: string
	params: Record<string, string>
	headers: { get: (name: string) => string | null }
	json: () => Promise<unknown>
	url: string
} {
	return {
		method: options.method,
		params: options.params,
		headers: {
			get: (name: string) => options.headers?.[name] ?? null
		},
		json: async () => options.body,
		url: options.url ?? 'http://localhost/test'
	}
}

// Helper to normalize handler response
async function normalizeResponse(
	result: Response | Record<string, unknown> | unknown[]
): Promise<{ status: number; body: unknown }> {
	if (result instanceof Response) {
		const body = result.status !== 204 ? await result.json() : null
		return { status: result.status, body }
	}
	// Plain object/array returned = success (200)
	return { status: 200, body: result }
}

describe('Webhooks', () => {
	let session: Session
	let token: string
	let guildId: string
	let channelId: string

	beforeEach(async () => {
		session = await sessionManager.create({
			name: 'webhook-test',
			config: {
				guilds: [{ name: 'Test Guild' }]
			}
		})
		token = session.token
		const guild = Array.from(session.state.guilds.values())[0]
		guildId = guild.id
		channelId = guild.channels[0]
	})

	afterEach(async () => {
		await sessionManager.delete(session.id)
	})

	describe('POST /channels/:id/webhooks (Create Webhook)', () => {
		it('should create a webhook successfully', async () => {
			const request = createMockRequest({
				method: 'POST',
				params: { id: channelId },
				headers: { Authorization: `Bot ${token}` },
				body: { name: 'Test Webhook' }
			})

			const result = await channelWebhooksHandler(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(200)

			const webhook = response.body as Record<string, unknown>
			expect(webhook.name).toBe('Test Webhook')
			expect(webhook.type).toBe(WebhookType.Incoming)
			expect(webhook.channel_id).toBe(channelId)
			expect(webhook.guild_id).toBe(guildId)
			expect(webhook.token).toBeDefined() // Creator gets token
			expect(webhook.url).toBeDefined()
			expect(webhook.user).toBeDefined()
		})

		it('should return 401 without authorization', async () => {
			const request = createMockRequest({
				method: 'POST',
				params: { id: channelId },
				body: { name: 'Test Webhook' }
			})

			const result = await channelWebhooksHandler(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(401)
		})

		it('should return 404 for unknown channel', async () => {
			const request = createMockRequest({
				method: 'POST',
				params: { id: 'unknown-channel' },
				headers: { Authorization: `Bot ${token}` },
				body: { name: 'Test Webhook' }
			})

			const result = await channelWebhooksHandler(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(404)
		})

		it('should return 400 if name is missing', async () => {
			const request = createMockRequest({
				method: 'POST',
				params: { id: channelId },
				headers: { Authorization: `Bot ${token}` },
				body: {}
			})

			const result = await channelWebhooksHandler(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(400)
		})

		it('should return 400 if name is too long', async () => {
			const request = createMockRequest({
				method: 'POST',
				params: { id: channelId },
				headers: { Authorization: `Bot ${token}` },
				body: { name: 'A'.repeat(WebhookLimits.MAX_NAME_LENGTH + 1) }
			})

			const result = await channelWebhooksHandler(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(400)
		})

		it('should return 400 if name contains "clyde"', async () => {
			const request = createMockRequest({
				method: 'POST',
				params: { id: channelId },
				headers: { Authorization: `Bot ${token}` },
				body: { name: 'Clyde Bot' }
			})

			const result = await channelWebhooksHandler(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(400)
		})

		it('should return 400 if name contains "discord"', async () => {
			const request = createMockRequest({
				method: 'POST',
				params: { id: channelId },
				headers: { Authorization: `Bot ${token}` },
				body: { name: 'Discord Bot' }
			})

			const result = await channelWebhooksHandler(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(400)

			const body = response.body as Record<string, unknown>
			expect(body.message).toContain('discord')
		})

		it('should record webhook_created action', async () => {
			const request = createMockRequest({
				method: 'POST',
				params: { id: channelId },
				headers: { Authorization: `Bot ${token}` },
				body: { name: 'Test Webhook' }
			})

			await channelWebhooksHandler(request as never)

			const actions = session.recorder.getAll()
			const createAction = actions.find((a) => a.type === 'webhook_created')
			expect(createAction).toBeDefined()
		})
	})

	describe('GET /channels/:id/webhooks (List Channel Webhooks)', () => {
		it('should list webhooks for a channel', async () => {
			// Create a webhook first
			session.state.createWebhook(channelId, { name: 'Webhook 1' }, session.state.botUser.id)
			session.state.createWebhook(channelId, { name: 'Webhook 2' }, session.state.botUser.id)

			const request = createMockRequest({
				method: 'GET',
				params: { id: channelId },
				headers: { Authorization: `Bot ${token}` }
			})

			const result = await channelWebhooksHandler(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(200)

			const webhooks = response.body as Record<string, unknown>[]
			expect(webhooks.length).toBe(2)
			expect(webhooks[0].name).toBe('Webhook 1')
			expect(webhooks[1].name).toBe('Webhook 2')
		})

		it('should return empty array if no webhooks', async () => {
			const request = createMockRequest({
				method: 'GET',
				params: { id: channelId },
				headers: { Authorization: `Bot ${token}` }
			})

			const result = await channelWebhooksHandler(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(200)
			expect(response.body).toEqual([])
		})
	})

	describe('GET /guilds/:id/webhooks (List Guild Webhooks)', () => {
		it('should list all webhooks in a guild', async () => {
			// Create webhooks in different channels
			session.state.createWebhook(channelId, { name: 'Webhook 1' }, session.state.botUser.id)

			const request = createMockRequest({
				method: 'GET',
				params: { id: guildId },
				headers: { Authorization: `Bot ${token}` }
			})

			const result = await guildWebhooksHandler(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(200)

			const webhooks = response.body as Record<string, unknown>[]
			expect(webhooks.length).toBe(1)
		})

		it('should return 404 for unknown guild', async () => {
			const request = createMockRequest({
				method: 'GET',
				params: { id: 'unknown-guild' },
				headers: { Authorization: `Bot ${token}` }
			})

			const result = await guildWebhooksHandler(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(404)
		})
	})

	describe('GET/PATCH/DELETE /webhooks/:id (By ID with Auth)', () => {
		let webhook: MockWebhook

		beforeEach(() => {
			webhook = session.state.createWebhook(channelId, { name: 'Test Webhook' }, session.state.botUser.id)!
		})

		it('should GET webhook by ID', async () => {
			const request = createMockRequest({
				method: 'GET',
				params: { id: webhook.id },
				headers: { Authorization: `Bot ${token}` }
			})

			const result = await webhookGetById(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(200)

			const body = response.body as Record<string, unknown>
			expect(body.id).toBe(webhook.id)
			expect(body.name).toBe('Test Webhook')
			// Creator should get token
			expect(body.token).toBeDefined()
		})

		it('should return 404 for unknown webhook', async () => {
			const request = createMockRequest({
				method: 'GET',
				params: { id: 'unknown' },
				headers: { Authorization: `Bot ${token}` }
			})

			const result = await webhookGetById(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(404)
		})

		it('should PATCH (modify) webhook', async () => {
			const request = createMockRequest({
				method: 'PATCH',
				params: { id: webhook.id },
				headers: { Authorization: `Bot ${token}` },
				body: { name: 'Updated Webhook' }
			})

			const result = await webhookPatchById(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(200)

			const body = response.body as Record<string, unknown>
			expect(body.name).toBe('Updated Webhook')

			// Verify in state
			const updated = session.state.getWebhook(webhook.id)
			expect(updated?.name).toBe('Updated Webhook')
		})

		it('should DELETE webhook', async () => {
			const request = createMockRequest({
				method: 'DELETE',
				params: { id: webhook.id },
				headers: { Authorization: `Bot ${token}` }
			})

			const result = await webhookDeleteById(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(204)

			// Verify deleted
			expect(session.state.getWebhook(webhook.id)).toBeUndefined()
		})
	})

	describe('GET/PATCH/DELETE/POST /webhooks/:id/:token (Token Auth)', () => {
		let webhook: MockWebhook

		beforeEach(() => {
			webhook = session.state.createWebhook(channelId, { name: 'Token Webhook' }, session.state.botUser.id)!
		})

		it('should GET webhook with token (no user field)', async () => {
			const request = createMockRequest({
				method: 'GET',
				params: { app_id: webhook.id, token: webhook.token! },
				url: 'http://localhost/test'
			})

			const result = await webhookWithTokenHandler(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(200)

			const body = response.body as Record<string, unknown>
			expect(body.id).toBe(webhook.id)
			expect(body.token).toBeDefined()
			expect(body.user).toBeUndefined() // No user when fetching via token
		})

		it('should return 404 if webhook ID does not match token', async () => {
			const request = createMockRequest({
				method: 'GET',
				params: { app_id: 'wrong-id', token: webhook.token! },
				url: 'http://localhost/test'
			})

			const result = await webhookWithTokenHandler(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(404)
		})

		it('should PATCH webhook with token', async () => {
			const request = createMockRequest({
				method: 'PATCH',
				params: { app_id: webhook.id, token: webhook.token! },
				body: { name: 'Token Updated' },
				url: 'http://localhost/test'
			})

			const result = await webhookWithTokenHandler(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(200)

			const body = response.body as Record<string, unknown>
			expect(body.name).toBe('Token Updated')
		})

		it('should DELETE webhook with token', async () => {
			const request = createMockRequest({
				method: 'DELETE',
				params: { app_id: webhook.id, token: webhook.token! },
				url: 'http://localhost/test'
			})

			const result = await webhookWithTokenHandler(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(204)

			expect(session.state.getWebhook(webhook.id)).toBeUndefined()
		})

		describe('POST (Execute Webhook)', () => {
			it('should execute webhook and return 204 by default', async () => {
				const request = createMockRequest({
					method: 'POST',
					params: { app_id: webhook.id, token: webhook.token! },
					body: { content: 'Hello from webhook!' },
					url: 'http://localhost/test'
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(204)

				// Verify action recorded
				const actions = session.recorder.getAll()
				const executeAction = actions.find((a) => a.type === 'webhook_executed')
				expect(executeAction).toBeDefined()
			})

			it('should return message when wait=true', async () => {
				const request = createMockRequest({
					method: 'POST',
					params: { app_id: webhook.id, token: webhook.token! },
					body: { content: 'Hello with wait!' },
					url: 'http://localhost/test?wait=true'
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(200)

				const body = response.body as Record<string, unknown>
				expect(body.content).toBe('Hello with wait!')
				expect(body.id).toBeDefined()
			})

			it('should support custom username', async () => {
				const request = createMockRequest({
					method: 'POST',
					params: { app_id: webhook.id, token: webhook.token! },
					body: { content: 'Custom name', username: 'Custom Bot' },
					url: 'http://localhost/test?wait=true'
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(200)

				const body = response.body as Record<string, unknown>
				const author = body.author as Record<string, unknown>
				expect(author.username).toBe('Custom Bot')
			})

			it('should support custom avatar_url', async () => {
				const customAvatar = 'https://example.com/custom-avatar.png'
				const request = createMockRequest({
					method: 'POST',
					params: { app_id: webhook.id, token: webhook.token! },
					body: { content: 'Custom avatar', avatar_url: customAvatar },
					url: 'http://localhost/test?wait=true'
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(200)

				const body = response.body as Record<string, unknown>
				const author = body.author as Record<string, unknown>
				expect(author.avatar).toBe(customAvatar)
			})

			it('should support poll in webhook message', async () => {
				const pollConfig = {
					question: { text: 'What is your favorite color?' },
					answers: [
						{ answer_id: 1, poll_media: { text: 'Red' } },
						{ answer_id: 2, poll_media: { text: 'Blue' } },
						{ answer_id: 3, poll_media: { text: 'Green' } }
					],
					duration: 24,
					allow_multiselect: false
				}

				const request = createMockRequest({
					method: 'POST',
					params: { app_id: webhook.id, token: webhook.token! },
					body: { poll: pollConfig },
					url: 'http://localhost/test?wait=true'
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(200)

				const body = response.body as Record<string, unknown>
				expect(body.poll).toBeDefined()
				const poll = body.poll as Record<string, unknown>
				const question = poll.question as Record<string, unknown>
				expect(question.text).toBe('What is your favorite color?')
			})

			it('should return 400 for empty message', async () => {
				const request = createMockRequest({
					method: 'POST',
					params: { app_id: webhook.id, token: webhook.token! },
					body: {},
					url: 'http://localhost/test'
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(400)

				const body = response.body as Record<string, unknown>
				expect(body.code).toBe(50006)
			})

			it('should support thread_id parameter', async () => {
				// Create a thread in the channel
				const thread = session.state.createThread({
					name: 'Test Thread',
					type: 11, // PublicThread
					parentId: channelId,
					guildId: guildId,
					ownerId: session.state.botUser.id
				})!

				const request = createMockRequest({
					method: 'POST',
					params: { app_id: webhook.id, token: webhook.token! },
					body: { content: 'Thread message' },
					url: `http://localhost/test?wait=true&thread_id=${thread.id}`
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(200)

				const body = response.body as Record<string, unknown>
				expect(body.content).toBe('Thread message')
				// Message should be in thread channel, not parent
				expect(body.channel_id).toBe(thread.id)
			})

			it('should return 404 for invalid thread_id', async () => {
				const request = createMockRequest({
					method: 'POST',
					params: { app_id: webhook.id, token: webhook.token! },
					body: { content: 'Invalid thread' },
					url: 'http://localhost/test?thread_id=invalid-thread'
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(404)
			})

			it('should support sticker_ids in webhook message', async () => {
				// Create a sticker first
				const sticker = session.state.createGuildSticker(
					guildId,
					{ name: 'Test Sticker', tags: 'test' },
					session.state.botUser.id
				)!

				const request = createMockRequest({
					method: 'POST',
					params: { app_id: webhook.id, token: webhook.token! },
					body: { sticker_ids: [sticker.id] },
					url: 'http://localhost/test?wait=true'
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(200)

				const body = response.body as Record<string, unknown>
				const stickers = body.sticker_items as Array<Record<string, unknown>>
				expect(stickers).toBeDefined()
				expect(stickers.length).toBe(1)
				expect(stickers[0].id).toBe(sticker.id)
			})

			it('should return 400 for more than 3 stickers', async () => {
				// Create 4 stickers
				const stickers = Array.from({ length: 4 }, (_, i) =>
					session.state.createGuildSticker(
						guildId,
						{ name: `Sticker ${i}`, tags: 'test' },
						session.state.botUser.id
					)!
				)

				const request = createMockRequest({
					method: 'POST',
					params: { app_id: webhook.id, token: webhook.token! },
					body: { sticker_ids: stickers.map((s) => s.id) },
					url: 'http://localhost/test'
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(400)

				const body = response.body as Record<string, unknown>
				expect(body.message).toContain('3 stickers')
			})

			it('should return 400 for unknown sticker_id', async () => {
				const request = createMockRequest({
					method: 'POST',
					params: { app_id: webhook.id, token: webhook.token! },
					body: { sticker_ids: ['unknown-sticker'] },
					url: 'http://localhost/test'
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(400)

				const body = response.body as Record<string, unknown>
				expect(body.message).toContain('Unknown sticker')
			})

			it('should support thread_name for forum channel thread creation', async () => {
				// Create a forum channel
				const forumChannel = session.state.createForumChannel({
					name: 'test-forum',
					guildId: guildId,
					available_tags: [{ name: 'Bug', moderated: false, emoji_id: null, emoji_name: null }]
				})

				// Create webhook for the forum channel
				const forumWebhook = session.state.createWebhook(
					forumChannel.id,
					{ name: 'Forum Webhook' },
					session.state.botUser.id
				)!

				const request = createMockRequest({
					method: 'POST',
					params: { app_id: forumWebhook.id, token: forumWebhook.token! },
					body: {
						thread_name: 'New Forum Post',
						content: 'This is the post content'
					},
					url: 'http://localhost/test?wait=true'
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(200)

				const body = response.body as Record<string, unknown>
				expect(body.content).toBe('This is the post content')
			})

			it('should support applied_tags with thread_name', async () => {
				// Create a forum channel with tags
				const forumChannel = session.state.createForumChannel({
					name: 'tagged-forum',
					guildId: guildId,
					available_tags: [
						{ name: 'Bug', moderated: false, emoji_id: null, emoji_name: null },
						{ name: 'Feature', moderated: false, emoji_id: null, emoji_name: null }
					]
				})

				// Get the actual generated tag ID
				const bugTagId = forumChannel.available_tags[0].id

				// Create webhook for the forum channel
				const forumWebhook = session.state.createWebhook(
					forumChannel.id,
					{ name: 'Tagged Forum Webhook' },
					session.state.botUser.id
				)!

				const request = createMockRequest({
					method: 'POST',
					params: { app_id: forumWebhook.id, token: forumWebhook.token! },
					body: {
						thread_name: 'Tagged Post',
						content: 'Post with tags',
						applied_tags: [bugTagId]
					},
					url: 'http://localhost/test?wait=true'
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(200)
			})

			it('should return 400 for thread_name on non-forum channel', async () => {
				const request = createMockRequest({
					method: 'POST',
					params: { app_id: webhook.id, token: webhook.token! },
					body: {
						thread_name: 'Invalid Thread',
						content: 'This should fail'
					},
					url: 'http://localhost/test'
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(400)

				const body = response.body as Record<string, unknown>
				expect(body.message).toContain('forum')
			})

			it('should return 400 for invalid applied_tags', async () => {
				// Create a forum channel
				const forumChannel = session.state.createForumChannel({
					name: 'invalid-tag-forum',
					guildId: guildId,
					available_tags: [{ name: 'Valid', moderated: false, emoji_id: null, emoji_name: null }]
				})

				const forumWebhook = session.state.createWebhook(
					forumChannel.id,
					{ name: 'Invalid Tag Webhook' },
					session.state.botUser.id
				)!

				const request = createMockRequest({
					method: 'POST',
					params: { app_id: forumWebhook.id, token: forumWebhook.token! },
					body: {
						thread_name: 'Post with invalid tag',
						content: 'Content',
						applied_tags: ['invalid-tag-id']
					},
					url: 'http://localhost/test'
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(400)

				const body = response.body as Record<string, unknown>
				expect(body.message).toContain('Invalid tag')
			})

			it('should strip interactive components from non-app webhooks without with_components', async () => {
				const request = createMockRequest({
					method: 'POST',
					params: { app_id: webhook.id, token: webhook.token! },
					body: {
						content: 'Message with buttons',
						components: [
							{
								type: 1, // Action Row
								components: [
									{ type: 2, style: 1, label: 'Primary', custom_id: 'btn1' }, // Interactive button
									{ type: 2, style: 5, label: 'Link', url: 'https://example.com' } // Link button
								]
							}
						]
					},
					url: 'http://localhost/test?wait=true'
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(200)

				const body = response.body as Record<string, unknown>
				const components = body.components as Array<{ components: Array<{ style: number }> }>
				// Only the link button (style 5) should remain
				expect(components.length).toBe(1)
				expect(components[0].components.length).toBe(1)
				expect(components[0].components[0].style).toBe(5)
			})

			it('should keep interactive components with with_components=true', async () => {
				const request = createMockRequest({
					method: 'POST',
					params: { app_id: webhook.id, token: webhook.token! },
					body: {
						content: 'Message with buttons',
						components: [
							{
								type: 1, // Action Row
								components: [
									{ type: 2, style: 1, label: 'Primary', custom_id: 'btn1' },
									{ type: 2, style: 5, label: 'Link', url: 'https://example.com' }
								]
							}
						]
					},
					url: 'http://localhost/test?wait=true&with_components=true'
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(200)

				const body = response.body as Record<string, unknown>
				const components = body.components as Array<{ components: Array<{ style: number }> }>
				// Both buttons should remain
				expect(components.length).toBe(1)
				expect(components[0].components.length).toBe(2)
			})

			it('should strip select menus from non-app webhooks without with_components', async () => {
				const request = createMockRequest({
					method: 'POST',
					params: { app_id: webhook.id, token: webhook.token! },
					body: {
						content: 'Message with select menu',
						components: [
							{
								type: 1, // Action Row
								components: [
									{
										type: 3, // String Select
										custom_id: 'select1',
										options: [{ label: 'Option 1', value: '1' }]
									}
								]
							}
						]
					},
					url: 'http://localhost/test?wait=true'
				})

				const result = await webhookWithTokenHandler(request as never)
				const response = await normalizeResponse(result as Response)
				expect(response.status).toBe(200)

				const body = response.body as Record<string, unknown>
				// Components should be empty (select menu stripped, action row removed)
				expect(body.components).toEqual([])
			})
		})
	})

	describe('Webhook Message Management', () => {
		let webhook: MockWebhook
		let messageId: string

		beforeEach(async () => {
			webhook = session.state.createWebhook(channelId, { name: 'Msg Webhook' }, session.state.botUser.id)!

			// Execute webhook to create a message
			const request = createMockRequest({
				method: 'POST',
				params: { app_id: webhook.id, token: webhook.token! },
				body: { content: 'Test message' },
				url: 'http://localhost/test?wait=true'
			})

			const result = await webhookWithTokenHandler(request as never)
			const response = await normalizeResponse(result as Response)
			messageId = (response.body as Record<string, unknown>).id as string
		})

		it('should GET webhook message', async () => {
			const request = createMockRequest({
				method: 'GET',
				params: { app_id: webhook.id, token: webhook.token!, messageId }
			})

			const result = await webhookMessageGet(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(200)

			const body = response.body as Record<string, unknown>
			expect(body.id).toBe(messageId)
			expect(body.content).toBe('Test message')
		})

		it('should PATCH (edit) webhook message', async () => {
			const request = createMockRequest({
				method: 'PATCH',
				params: { app_id: webhook.id, token: webhook.token!, messageId },
				body: { content: 'Edited message' }
			})

			const result = await webhookMessagePatch(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(200)

			const body = response.body as Record<string, unknown>
			expect(body.content).toBe('Edited message')
		})

		it('should DELETE webhook message', async () => {
			const request = createMockRequest({
				method: 'DELETE',
				params: { app_id: webhook.id, token: webhook.token!, messageId }
			})

			const result = await webhookMessageDelete(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(204)

			// Verify deleted
			expect(session.state.getMessage(messageId)).toBeUndefined()
		})

		it('should return 404 for unknown message', async () => {
			const request = createMockRequest({
				method: 'GET',
				params: { app_id: webhook.id, token: webhook.token!, messageId: 'unknown' }
			})

			const result = await webhookMessageGet(request as never)
			const response = await normalizeResponse(result as Response)
			expect(response.status).toBe(404)
		})
	})

	describe('State Management', () => {
		it('should store webhook in state', () => {
			const webhook = session.state.createWebhook(channelId, { name: 'State Test' }, session.state.botUser.id)
			expect(webhook).toBeDefined()
			expect(session.state.getWebhook(webhook!.id)).toBeDefined()
		})

		it('should get webhook by token', () => {
			const webhook = session.state.createWebhook(channelId, { name: 'Token Test' }, session.state.botUser.id)
			const found = session.state.getWebhookByToken(webhook!.token!)
			expect(found).toBeDefined()
			expect(found?.id).toBe(webhook!.id)
		})

		it('should list webhooks for channel', () => {
			session.state.createWebhook(channelId, { name: 'W1' }, session.state.botUser.id)
			session.state.createWebhook(channelId, { name: 'W2' }, session.state.botUser.id)

			const webhooks = session.state.getWebhooksForChannel(channelId)
			expect(webhooks.length).toBe(2)
		})

		it('should list webhooks for guild', () => {
			session.state.createWebhook(channelId, { name: 'G1' }, session.state.botUser.id)

			const webhooks = session.state.getWebhooksForGuild(guildId)
			expect(webhooks.length).toBe(1)
		})

		it('should delete webhook and remove from token index', () => {
			const webhook = session.state.createWebhook(channelId, { name: 'Delete Test' }, session.state.botUser.id)!
			const webhookToken = webhook.token!

			expect(session.state.deleteWebhook(webhook.id)).toBe(true)
			expect(session.state.getWebhook(webhook.id)).toBeUndefined()
			expect(session.state.getWebhookByToken(webhookToken)).toBeUndefined()
		})

		it('should enforce max webhooks per channel', () => {
			// Create max webhooks
			for (let i = 0; i < WebhookLimits.MAX_WEBHOOKS_PER_CHANNEL; i++) {
				const wh = session.state.createWebhook(channelId, { name: `Webhook ${i}` }, session.state.botUser.id)
				expect(wh).toBeDefined()
			}

			// Try to create one more
			const extra = session.state.createWebhook(channelId, { name: 'Too Many' }, session.state.botUser.id)
			expect(extra).toBeNull()
		})
	})

	describe('Payload Conversion', () => {
		it('should convert webhook to API format', async () => {
			const request = createMockRequest({
				method: 'POST',
				params: { id: channelId },
				headers: { Authorization: `Bot ${token}` },
				body: { name: 'API Test', avatar: null }
			})

			const result = await channelWebhooksHandler(request as never)
			const response = await normalizeResponse(result as Response)

			const body = response.body as Record<string, unknown>
			expect(body.id).toBeDefined()
			expect(body.type).toBe(WebhookType.Incoming)
			expect(body.name).toBe('API Test')
			expect(body.avatar).toBeNull()
			expect(body.channel_id).toBe(channelId)
			expect(body.guild_id).toBe(guildId)
			expect(body.application_id).toBeNull()
		})
	})

	describe('WEBHOOKS_UPDATE Gateway Event', () => {
		// Helper to find dispatch action for WEBHOOKS_UPDATE
		function findWebhooksUpdateDispatch() {
			const actions = session.recorder.getAll()
			return actions.find(
				(a) =>
					a.type === 'dispatch' &&
					(a.data as { event?: string }).event === 'WEBHOOKS_UPDATE'
			)
		}

		it('should dispatch WEBHOOKS_UPDATE when webhook is created', async () => {
			const request = createMockRequest({
				method: 'POST',
				params: { id: channelId },
				headers: { Authorization: `Bot ${token}` },
				body: { name: 'Event Test Webhook' }
			})

			await channelWebhooksHandler(request as never)

			const dispatchAction = findWebhooksUpdateDispatch()
			expect(dispatchAction).toBeDefined()

			const payload = (dispatchAction!.data as { payload: { guild_id: string; channel_id: string } }).payload
			expect(payload.guild_id).toBe(guildId)
			expect(payload.channel_id).toBe(channelId)
		})

		it('should dispatch WEBHOOKS_UPDATE when webhook is updated via ID', async () => {
			const webhook = session.state.createWebhook(channelId, { name: 'Update Test' }, session.state.botUser.id)!
			session.recorder.clear() // Clear any previous actions

			const request = createMockRequest({
				method: 'PATCH',
				params: { id: webhook.id },
				headers: { Authorization: `Bot ${token}` },
				body: { name: 'Updated Name' }
			})

			await webhookPatchById(request as never)

			const dispatchAction = findWebhooksUpdateDispatch()
			expect(dispatchAction).toBeDefined()

			const payload = (dispatchAction!.data as { payload: { guild_id: string; channel_id: string } }).payload
			expect(payload.guild_id).toBe(guildId)
			expect(payload.channel_id).toBe(channelId)
		})

		it('should dispatch WEBHOOKS_UPDATE when webhook is deleted via ID', async () => {
			const webhook = session.state.createWebhook(channelId, { name: 'Delete Test' }, session.state.botUser.id)!
			session.recorder.clear() // Clear any previous actions

			const request = createMockRequest({
				method: 'DELETE',
				params: { id: webhook.id },
				headers: { Authorization: `Bot ${token}` }
			})

			await webhookDeleteById(request as never)

			const dispatchAction = findWebhooksUpdateDispatch()
			expect(dispatchAction).toBeDefined()

			const payload = (dispatchAction!.data as { payload: { guild_id: string; channel_id: string } }).payload
			expect(payload.guild_id).toBe(guildId)
			expect(payload.channel_id).toBe(channelId)
		})

		it('should dispatch WEBHOOKS_UPDATE when webhook is updated via token', async () => {
			const webhook = session.state.createWebhook(channelId, { name: 'Token Update Test' }, session.state.botUser.id)!
			session.recorder.clear() // Clear any previous actions

			const request = createMockRequest({
				method: 'PATCH',
				params: { app_id: webhook.id, token: webhook.token! },
				body: { name: 'Token Updated' },
				url: 'http://localhost/test'
			})

			await webhookWithTokenHandler(request as never)

			const dispatchAction = findWebhooksUpdateDispatch()
			expect(dispatchAction).toBeDefined()

			const payload = (dispatchAction!.data as { payload: { guild_id: string; channel_id: string } }).payload
			expect(payload.guild_id).toBe(guildId)
			expect(payload.channel_id).toBe(channelId)
		})

		it('should dispatch WEBHOOKS_UPDATE when webhook is deleted via token', async () => {
			const webhook = session.state.createWebhook(channelId, { name: 'Token Delete Test' }, session.state.botUser.id)!
			session.recorder.clear() // Clear any previous actions

			const request = createMockRequest({
				method: 'DELETE',
				params: { app_id: webhook.id, token: webhook.token! },
				url: 'http://localhost/test'
			})

			await webhookWithTokenHandler(request as never)

			const dispatchAction = findWebhooksUpdateDispatch()
			expect(dispatchAction).toBeDefined()

			const payload = (dispatchAction!.data as { payload: { guild_id: string; channel_id: string } }).payload
			expect(payload.guild_id).toBe(guildId)
			expect(payload.channel_id).toBe(channelId)
		})

		it('should dispatch WEBHOOKS_UPDATE for both channels when webhook is moved', async () => {
			// Create a second channel to move the webhook to
			const secondChannel = createMockChannel({
				name: 'second-channel',
				guildId: guildId,
				type: 0 // Text channel
			})
			session.state.addChannel(secondChannel)
			const secondChannelId = secondChannel.id

			const webhook = session.state.createWebhook(channelId, { name: 'Move Test' }, session.state.botUser.id)!
			session.recorder.clear() // Clear any previous actions

			const request = createMockRequest({
				method: 'PATCH',
				params: { id: webhook.id },
				body: { channel_id: secondChannelId },
				headers: { Authorization: `Bot ${token}` }
			})

			await webhookPatchById(request as never)

			// Find all WEBHOOKS_UPDATE dispatches
			const actions = session.recorder.getAll()
			const dispatchActions = actions.filter(
				(a) =>
					a.type === 'dispatch' &&
					(a.data as { event?: string }).event === 'WEBHOOKS_UPDATE'
			)

			// Should dispatch for BOTH old and new channels
			expect(dispatchActions.length).toBe(2)

			const payloads = dispatchActions.map(
				(a) => (a.data as { payload: { guild_id: string; channel_id: string } }).payload
			)

			// One dispatch should be for the old channel
			expect(payloads.some((p) => p.channel_id === channelId)).toBe(true)
			// One dispatch should be for the new channel
			expect(payloads.some((p) => p.channel_id === secondChannelId)).toBe(true)
			// Both should have the same guild
			expect(payloads.every((p) => p.guild_id === guildId)).toBe(true)
		})
	})
})
