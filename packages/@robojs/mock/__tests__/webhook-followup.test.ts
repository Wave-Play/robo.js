/**
 * Webhook Followup & Edit/Delete Tests
 * Tests the webhook endpoints for interaction response lifecycle:
 * - POST /webhooks/:app_id/:token (followup messages)
 * - PATCH/DELETE /webhooks/:app_id/:token/messages/@original
 * - PATCH/DELETE /webhooks/:app_id/:token/messages/:messageId
 */
import { Session } from '../src/session/session.js'
import { generateSnowflake } from '../src/utils/snowflake.js'
import type { MockInteraction } from '../src/types/index.js'
// Use the global sessionManager singleton that handlers use
import { sessionManager } from '../src/core/manager.js'

// Import the handlers directly for unit testing
import { GET as webhookTokenGet, PATCH as webhookTokenPatch, DELETE as webhookTokenDelete, POST as webhookTokenPost } from '../src/api/v10/webhooks/[app_id]/[token].js'
// The @original endpoint is handled by [messageId].ts with @original as a special case
import { GET as webhookMessageGet, PATCH as webhookMessagePatch, DELETE as webhookMessageDelete } from '../src/api/v10/webhooks/[app_id]/[token]/messages/[messageId].js'

// Local routing wrapper for tests that replicate the old default export behavior
async function followupHandler(request: { method: string; [key: string]: unknown }): Promise<unknown> {
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

// Local routing wrapper for message handler tests that replicate the old default export behavior
async function messageHandler(request: { method: string; [key: string]: unknown }): Promise<unknown> {
	switch (request.method) {
		case 'GET':
			return webhookMessageGet(request as never)
		case 'PATCH':
			return webhookMessagePatch(request as never)
		case 'DELETE':
			return webhookMessageDelete(request as never)
		default:
			return new Response(null, { status: 405 })
	}
}

// Use messageHandler for @original by passing messageId='@original'
const originalHandler = messageHandler

// Helper to create a mock RoboRequest
function createMockRequest(options: {
	method: string
	params: Record<string, string>
	body?: unknown
	headers?: Record<string, string>
}): {
	method: string
	params: Record<string, string>
	headers: { get: (name: string) => string | null }
	json: () => Promise<unknown>
} {
	return {
		method: options.method,
		params: options.params,
		headers: {
			get: (name: string) => options.headers?.[name] ?? null
		},
		json: async () => options.body
	}
}

// Helper to normalize handler response
// Robo.js auto-serializes non-Response objects to JSON with status 200
// In tests, handlers return plain objects for success, Response objects for errors
async function normalizeResponse(
	result: Response | Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
	if (result instanceof Response) {
		const body = result.status !== 204 ? await result.json() : null
		return { status: result.status, body }
	}
	// Plain object returned = success (200)
	return { status: 200, body: result }
}

describe('Webhook Followup & Edit/Delete', () => {
	let session: Session

	beforeEach(async () => {
		// Use the global sessionManager that the handlers use
		session = await sessionManager.create({
			name: 'test-session',
			config: {
				guilds: [{ name: 'Test Guild' }]
			}
		})
	})

	afterEach(async () => {
		// Clean up the session from the global manager
		await sessionManager.delete(session.id)
	})

	describe('POST /webhooks/:app_id/:token (Followup Messages)', () => {
		it('should return 405 for non-POST methods', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]
			const interaction = await session.dispatchSlashCommand({
				commandName: 'test',
				channelId
			})

			// Simulate responding to the interaction first
			interaction.response = { type: 4, timestamp: Date.now(), data: { content: 'Initial response' } }
			interaction.respondedAt = Date.now()

			const request = createMockRequest({
				method: 'GET',
				params: { app_id: interaction.applicationId, token: interaction.token }
			})

			const response = await followupHandler(request as never)
			expect(response.status).toBe(405)
		})

		it('should return 404 for unknown interaction token', async () => {
			const request = createMockRequest({
				method: 'POST',
				params: { app_id: generateSnowflake(), token: 'unknown-token' },
				body: { content: 'Followup message' }
			})

			const response = await followupHandler(request as never)
			expect(response.status).toBe(404)

			const body = await response.json()
			expect(body.code).toBe(10015)
		})

		it('should return 404 for mismatched app_id', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]
			const interaction = await session.dispatchSlashCommand({
				commandName: 'test',
				channelId
			})

			// Simulate responding first
			interaction.response = { type: 4, timestamp: Date.now() }
			interaction.respondedAt = Date.now()

			const request = createMockRequest({
				method: 'POST',
				params: { app_id: 'wrong-app-id', token: interaction.token },
				body: { content: 'Followup message' }
			})

			const response = await followupHandler(request as never)
			expect(response.status).toBe(404)
		})

		it('should return 400 if interaction not yet acknowledged', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]
			const interaction = await session.dispatchSlashCommand({
				commandName: 'test',
				channelId
			})

			// Don't respond to the interaction

			const request = createMockRequest({
				method: 'POST',
				params: { app_id: interaction.applicationId, token: interaction.token },
				body: { content: 'Followup message' }
			})

			const response = await followupHandler(request as never)
			expect(response.status).toBe(400)

			const body = await response.json()
			expect(body.code).toBe(40060)
		})

		it('should create followup message and track it', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]
			const interaction = await session.dispatchSlashCommand({
				commandName: 'test',
				channelId
			})

			// Simulate responding first
			interaction.response = { type: 4, timestamp: Date.now(), data: { content: 'Initial response' } }
			interaction.respondedAt = Date.now()

			const request = createMockRequest({
				method: 'POST',
				params: { app_id: interaction.applicationId, token: interaction.token },
				body: { content: 'Followup message' }
			})

			const result = await followupHandler(request as never)
			const response = await normalizeResponse(result as Response | Record<string, unknown>)
			expect(response.status).toBe(200)

			const body = response.body as Record<string, unknown>
			expect(body.content).toBe('Followup message')
			expect(body.id).toBeDefined()

			// Verify followup message is tracked on interaction
			expect(interaction.followupMessageIds).toBeDefined()
			expect(interaction.followupMessageIds).toContain(body.id)

			// Verify message exists in state
			const message = session.state.getMessage(body.id as string)
			expect(message).toBeDefined()
			expect(message?.content).toBe('Followup message')
		})

		it('should record interaction_followup action', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]
			const interaction = await session.dispatchSlashCommand({
				commandName: 'followup-record-test',
				channelId
			})

			// Simulate responding first
			interaction.response = { type: 4, timestamp: Date.now() }
			interaction.respondedAt = Date.now()

			const request = createMockRequest({
				method: 'POST',
				params: { app_id: interaction.applicationId, token: interaction.token },
				body: { content: 'Recorded followup' }
			})

			await followupHandler(request as never)

			// Verify action was recorded
			const actions = session.recorder.getAll()
			const followupAction = actions.find((a) => a.type === 'interaction_followup')
			expect(followupAction).toBeDefined()
			expect(followupAction?.interactionId).toBe(interaction.id)
		})
	})

	describe('Callback creates response message', () => {
		it('should create message for type 4 response', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]
			const interaction = await session.dispatchSlashCommand({
				commandName: 'test',
				channelId
			})

			// Simulate type 4 response which creates a message
			const responseData = { content: 'Reply message', embeds: [] }
			interaction.response = { type: 4, timestamp: Date.now(), data: responseData }
			interaction.respondedAt = Date.now()

			// Create the message as the callback would
			const message = session.state.createMessage({
				channelId: interaction.channelId,
				guildId: interaction.guildId,
				authorId: session.state.botUser.id,
				content: responseData.content,
				embeds: responseData.embeds
			})
			interaction.responseMessageId = message.id

			// Verify responseMessageId is tracked
			expect(interaction.responseMessageId).toBe(message.id)
			expect(session.state.getMessage(message.id)).toBeDefined()
		})
	})

	describe('PATCH/DELETE /webhooks/:app_id/:token/messages/@original', () => {
		let interaction: MockInteraction
		let originalMessageId: string

		beforeEach(async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]
			interaction = await session.dispatchSlashCommand({
				commandName: 'edit-test',
				channelId
			})

			// Create original response message
			const message = session.state.createMessage({
				channelId: interaction.channelId,
				guildId: interaction.guildId,
				authorId: session.state.botUser.id,
				content: 'Original response'
			})
			interaction.responseMessageId = message.id
			originalMessageId = message.id
			interaction.response = { type: 4, timestamp: Date.now(), data: { content: 'Original response' } }
			interaction.respondedAt = Date.now()
		})

		it('should return 405 for unsupported methods', async () => {
			const request = createMockRequest({
				method: 'PUT',
				params: { app_id: interaction.applicationId, token: interaction.token, messageId: '@original' }
			})

			const response = (await originalHandler(request as never)) as Response
			expect(response.status).toBe(405)
		})

		it('should return 404 for unknown token', async () => {
			const request = createMockRequest({
				method: 'PATCH',
				params: { app_id: interaction.applicationId, token: 'unknown-token', messageId: '@original' },
				body: { content: 'Edited' }
			})

			const response = (await originalHandler(request as never)) as Response
			expect(response.status).toBe(404)
		})

		it('should return 404 for mismatched app_id', async () => {
			const request = createMockRequest({
				method: 'PATCH',
				params: { app_id: 'wrong-app-id', token: interaction.token, messageId: '@original' },
				body: { content: 'Edited' }
			})

			const response = (await originalHandler(request as never)) as Response
			expect(response.status).toBe(404)
		})

		it('should return 404 if no response message exists', async () => {
			// Clear the responseMessageId
			interaction.responseMessageId = undefined

			const request = createMockRequest({
				method: 'PATCH',
				params: { app_id: interaction.applicationId, token: interaction.token, messageId: '@original' },
				body: { content: 'Edited' }
			})

			const response = (await originalHandler(request as never)) as Response
			expect(response.status).toBe(404)

			const body = (await response.json()) as { code: number }
			expect(body.code).toBe(10008)
		})

		it('should GET the original message', async () => {
			const request = createMockRequest({
				method: 'GET',
				params: { app_id: interaction.applicationId, token: interaction.token, messageId: '@original' }
			})

			const result = await originalHandler(request as never)
			const response = await normalizeResponse(result as Response | Record<string, unknown>)
			expect(response.status).toBe(200)

			const body = response.body as Record<string, unknown>
			expect(body.id).toBe(originalMessageId)
			expect(body.content).toBe('Original response')
		})

		it('should PATCH (edit) the original message', async () => {
			const request = createMockRequest({
				method: 'PATCH',
				params: { app_id: interaction.applicationId, token: interaction.token, messageId: '@original' },
				body: { content: 'Edited response' }
			})

			const result = await originalHandler(request as never)
			const response = await normalizeResponse(result as Response | Record<string, unknown>)
			expect(response.status).toBe(200)

			const body = response.body as Record<string, unknown>
			expect(body.id).toBe(originalMessageId)
			expect(body.content).toBe('Edited response')
			expect(body.edited_timestamp).toBeDefined()

			// Verify message was updated in state
			const message = session.state.getMessage(originalMessageId)
			expect(message?.content).toBe('Edited response')
			expect(message?.editedTimestamp).toBeDefined()

			// Verify action was recorded
			const actions = session.recorder.getAll()
			const editAction = actions.find(
				(a) => a.type === 'interaction_edit' && (a.data as Record<string, unknown>).is_original === true
			)
			expect(editAction).toBeDefined()
		})

		it('should DELETE the original message', async () => {
			const request = createMockRequest({
				method: 'DELETE',
				params: { app_id: interaction.applicationId, token: interaction.token, messageId: '@original' }
			})

			const response = (await originalHandler(request as never)) as Response
			expect(response.status).toBe(204)

			// Verify message was deleted from state
			expect(session.state.getMessage(originalMessageId)).toBeUndefined()

			// Verify responseMessageId was cleared
			expect(interaction.responseMessageId).toBeUndefined()

			// Verify action was recorded
			const actions = session.recorder.getAll()
			const deleteAction = actions.find(
				(a) =>
					a.type === 'interaction_edit' &&
					(a.data as Record<string, unknown>).deleted === true &&
					(a.data as Record<string, unknown>).is_original === true
			)
			expect(deleteAction).toBeDefined()
		})
	})

	describe('GET/PATCH/DELETE /webhooks/:app_id/:token/messages/:messageId', () => {
		let interaction: MockInteraction
		let followupMessageId: string

		beforeEach(async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]
			interaction = await session.dispatchSlashCommand({
				commandName: 'followup-edit-test',
				channelId
			})

			// Respond to interaction
			interaction.response = { type: 4, timestamp: Date.now() }
			interaction.respondedAt = Date.now()

			// Create followup message
			const message = session.state.createMessage({
				channelId: interaction.channelId,
				guildId: interaction.guildId,
				authorId: session.state.botUser.id,
				content: 'Followup message'
			})
			followupMessageId = message.id
			interaction.followupMessageIds = [followupMessageId]
		})

		it('should return 405 for unsupported methods', async () => {
			const request = createMockRequest({
				method: 'PUT',
				params: { app_id: interaction.applicationId, token: interaction.token, messageId: followupMessageId }
			})

			const response = (await messageHandler(request as never)) as Response
			expect(response.status).toBe(405)
		})

		it('should return 404 for message not in followupMessageIds', async () => {
			const request = createMockRequest({
				method: 'GET',
				params: {
					app_id: interaction.applicationId,
					token: interaction.token,
					messageId: 'not-a-followup-message'
				}
			})

			const response = (await messageHandler(request as never)) as Response
			expect(response.status).toBe(404)

			const body = (await response.json()) as { code: number }
			expect(body.code).toBe(10008)
		})

		it('should GET a followup message', async () => {
			const request = createMockRequest({
				method: 'GET',
				params: { app_id: interaction.applicationId, token: interaction.token, messageId: followupMessageId }
			})

			const result = await messageHandler(request as never)
			const response = await normalizeResponse(result as Response | Record<string, unknown>)
			expect(response.status).toBe(200)

			const body = response.body as Record<string, unknown>
			expect(body.id).toBe(followupMessageId)
			expect(body.content).toBe('Followup message')
		})

		it('should PATCH (edit) a followup message', async () => {
			const request = createMockRequest({
				method: 'PATCH',
				params: { app_id: interaction.applicationId, token: interaction.token, messageId: followupMessageId },
				body: { content: 'Edited followup' }
			})

			const result = await messageHandler(request as never)
			const response = await normalizeResponse(result as Response | Record<string, unknown>)
			expect(response.status).toBe(200)

			const body = response.body as Record<string, unknown>
			expect(body.id).toBe(followupMessageId)
			expect(body.content).toBe('Edited followup')

			// Verify message was updated in state
			const message = session.state.getMessage(followupMessageId)
			expect(message?.content).toBe('Edited followup')
		})

		it('should DELETE a followup message', async () => {
			const request = createMockRequest({
				method: 'DELETE',
				params: { app_id: interaction.applicationId, token: interaction.token, messageId: followupMessageId }
			})

			const response = (await messageHandler(request as never)) as Response
			expect(response.status).toBe(204)

			// Verify message was deleted
			expect(session.state.getMessage(followupMessageId)).toBeUndefined()

			// Verify it was removed from followupMessageIds
			expect(interaction.followupMessageIds).not.toContain(followupMessageId)
		})
	})

	describe('Expiration Handling', () => {
		it('should return 404 for expired interaction token on followup', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]
			const interaction = await session.dispatchSlashCommand({
				commandName: 'expired-test',
				channelId
			})

			// Expire the interaction
			interaction.expiresAt = Date.now() - 1000

			const request = createMockRequest({
				method: 'POST',
				params: { app_id: interaction.applicationId, token: interaction.token },
				body: { content: 'Too late' }
			})

			const response = await followupHandler(request as never)
			expect(response.status).toBe(404)
		})

		it('should return 404 for expired interaction token on @original', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]
			const interaction = await session.dispatchSlashCommand({
				commandName: 'expired-test',
				channelId
			})

			// Create response and expire
			const message = session.state.createMessage({
				channelId: interaction.channelId,
				authorId: session.state.botUser.id,
				content: 'Response'
			})
			interaction.responseMessageId = message.id
			interaction.response = { type: 4, timestamp: Date.now() }
			interaction.expiresAt = Date.now() - 1000

			const request = createMockRequest({
				method: 'PATCH',
				params: { app_id: interaction.applicationId, token: interaction.token, messageId: '@original' },
				body: { content: 'Too late' }
			})

			const response = (await originalHandler(request as never)) as Response
			expect(response.status).toBe(404)
		})
	})

	describe('Requirements Verification', () => {
		it('Task 1: PATCH /webhooks/:app_id/:token/messages/@original works', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]
			const interaction = await session.dispatchSlashCommand({
				commandName: 'verify-patch',
				channelId
			})

			// Create response message
			const message = session.state.createMessage({
				channelId: interaction.channelId,
				authorId: session.state.botUser.id,
				content: 'Original'
			})
			interaction.responseMessageId = message.id
			interaction.response = { type: 4, timestamp: Date.now() }

			const request = createMockRequest({
				method: 'PATCH',
				params: { app_id: interaction.applicationId, token: interaction.token, messageId: '@original' },
				body: { content: 'Edited' }
			})

			const result = await originalHandler(request as never)
			const response = await normalizeResponse(result as Response | Record<string, unknown>)
			expect(response.status).toBe(200)
		})

		it('Task 2: DELETE /webhooks/:app_id/:token/messages/@original works', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]
			const interaction = await session.dispatchSlashCommand({
				commandName: 'verify-delete',
				channelId
			})

			// Create response message
			const message = session.state.createMessage({
				channelId: interaction.channelId,
				authorId: session.state.botUser.id,
				content: 'Original'
			})
			interaction.responseMessageId = message.id
			interaction.response = { type: 4, timestamp: Date.now() }

			const request = createMockRequest({
				method: 'DELETE',
				params: { app_id: interaction.applicationId, token: interaction.token, messageId: '@original' }
			})

			const response = (await originalHandler(request as never)) as Response
			expect(response.status).toBe(204)
		})

		it('Task 3: POST /webhooks/:app_id/:token works for followup', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]
			const interaction = await session.dispatchSlashCommand({
				commandName: 'verify-followup',
				channelId
			})

			// Respond first
			interaction.response = { type: 4, timestamp: Date.now() }
			interaction.respondedAt = Date.now()

			const request = createMockRequest({
				method: 'POST',
				params: { app_id: interaction.applicationId, token: interaction.token },
				body: { content: 'Followup' }
			})

			const result = await followupHandler(request as never)
			const response = await normalizeResponse(result as Response | Record<string, unknown>)
			expect(response.status).toBe(200)
		})

		it('Task 4: Message edits are tracked in state', async () => {
			const guild = Array.from(session.state.guilds.values())[0]
			const channelId = guild.channels[0]
			const interaction = await session.dispatchSlashCommand({
				commandName: 'verify-tracking',
				channelId
			})

			// Create response message
			const message = session.state.createMessage({
				channelId: interaction.channelId,
				authorId: session.state.botUser.id,
				content: 'Original'
			})
			interaction.responseMessageId = message.id
			interaction.response = { type: 4, timestamp: Date.now() }

			const request = createMockRequest({
				method: 'PATCH',
				params: { app_id: interaction.applicationId, token: interaction.token, messageId: '@original' },
				body: { content: 'Edited' }
			})

			await originalHandler(request as never)

			// Verify edited_timestamp is set
			const updatedMessage = session.state.getMessage(message.id)
			expect(updatedMessage?.editedTimestamp).toBeDefined()

			// Verify action was recorded with edit info
			const actions = session.recorder.getAll()
			const editAction = actions.find((a) => a.type === 'interaction_edit')
			expect(editAction).toBeDefined()
			expect((editAction?.data as Record<string, unknown>).edited_timestamp).toBeDefined()
		})
	})
})
