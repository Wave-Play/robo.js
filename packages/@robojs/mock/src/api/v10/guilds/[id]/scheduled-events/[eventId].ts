import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'
import { mockScheduledEventToAPIScheduledEvent } from '../../../../../discord/payloads.js'
import {
	GuildScheduledEventEntityType,
	GuildScheduledEventStatus,
	ScheduledEventLimits
} from '../../../../../types/index.js'
import { enforcePermissions } from '../../../../../utils/permission-check.js'

/**
 * GET /api/v10/guilds/:id/scheduled-events/:eventId - Get a scheduled event
 * PATCH /api/v10/guilds/:id/scheduled-events/:eventId - Modify a scheduled event
 * DELETE /api/v10/guilds/:id/scheduled-events/:eventId - Delete a scheduled event
 *
 * @see https://discord.com/developers/docs/resources/guild-scheduled-event#get-guild-scheduled-event
 * @see https://discord.com/developers/docs/resources/guild-scheduled-event#modify-guild-scheduled-event
 * @see https://discord.com/developers/docs/resources/guild-scheduled-event#delete-guild-scheduled-event
 */
function resolveScheduledEvent(request: RoboRequest) {
	// 1. Parse Authorization header → get session
	const authHeader = request.headers.get('Authorization') || ''
	const sessionId = parseMockToken(authHeader)

	if (!sessionId) {
		return new Response(JSON.stringify({ message: 'Unauthorized', code: 0 }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	const session = sessionManager.get(sessionId)
	if (!session) {
		return new Response(JSON.stringify({ message: 'Unauthorized', code: 0 }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 2. Extract guild ID and event ID from params
	const { id: guildId, eventId } = request.params as { id: string; eventId: string }

	// 3. Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 4. Get the scheduled event
	const event = session.state.getScheduledEvent(guildId, eventId)
	if (!event) {
		return new Response(JSON.stringify({ message: 'Unknown Scheduled Event', code: 10070 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, guild, guildId, event, eventId }
}

const ScheduledEventResponseSchema = z
	.object({
		id: z.string(),
		guild_id: z.string(),
		name: z.string(),
		description: z.string().nullable(),
		channel_id: z.string().nullable(),
		creator_id: z.string().nullable(),
		creator: z.object({}).passthrough().optional(),
		image: z.string().nullable(),
		scheduled_start_time: z.string(),
		scheduled_end_time: z.string().nullable(),
		status: z.number(),
		entity_type: z.number(),
		entity_id: z.string().nullable(),
		user_count: z.number().optional(),
		privacy_level: z.number(),
		user_rsvp: z.object({}).passthrough().nullable().optional(),
		entity_metadata: z.object({}).passthrough().nullable()
	})
	.passthrough()

const scheduledEventParams = z.object({
	id: z.string().describe('The guild ID (Snowflake)'),
	eventId: z.string().describe('The scheduled event ID (Snowflake)')
})

export const GET = define(
	{
		summary: 'Get scheduled event',
		description: 'Get a guild scheduled event',
		tags: ['Guild Scheduled Events'],
		params: scheduledEventParams,
		query: z.object({
			with_user_count: z.string().optional()
		}),
		response: {
			200: ScheduledEventResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveScheduledEvent(request)
		if (resolved instanceof Response) return resolved
		const { event } = resolved

		// Parse query parameter
		const url = new URL(request.url)
		const withUserCount = url.searchParams.get('with_user_count') === 'true'

		const apiEvent = mockScheduledEventToAPIScheduledEvent(event)
		if (withUserCount) {
			apiEvent.user_count = event.subscribers.size
		}

		return apiEvent
	}
)

export const PATCH = define(
	{
		summary: 'Update scheduled event',
		description: 'Modify a guild scheduled event',
		tags: ['Guild Scheduled Events'],
		params: scheduledEventParams,
		body: z
			.object({
				channel_id: z.string().nullable().optional(),
				entity_metadata: z
					.object({
						location: z.string().optional()
					})
					.passthrough()
					.nullable()
					.optional(),
				name: z.string().max(100).optional(),
				privacy_level: z.number().optional(),
				scheduled_start_time: z.string().optional(),
				scheduled_end_time: z.string().nullable().optional(),
				description: z.string().nullable().max(1000).optional(),
				entity_type: z.number().optional(),
				status: z.number().optional(),
				image: z.string().nullable().optional()
			})
			.passthrough(),
		response: {
			200: ScheduledEventResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveScheduledEvent(request)
		if (resolved instanceof Response) return resolved
		const { session, guildId, event, eventId } = resolved

		// Check permissions (MANAGE_EVENTS required)
		const permError = enforcePermissions(session, 'PATCH', `/guilds/${guildId}/scheduled-events/${eventId}`, undefined, guildId)
		if (permError) return permError

		// Parse request body
		let body: {
			channel_id?: string | null
			entity_metadata?: { location?: string } | null
			name?: string
			privacy_level?: number
			scheduled_start_time?: string
			scheduled_end_time?: string
			description?: string | null
			entity_type?: GuildScheduledEventEntityType
			status?: GuildScheduledEventStatus
			image?: string | null
		}

		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate name length if provided
		if (body.name !== undefined) {
			if (body.name.length < ScheduledEventLimits.MIN_NAME_LENGTH) {
				return new Response(
					JSON.stringify({ message: `Event name must be at least ${ScheduledEventLimits.MIN_NAME_LENGTH} character`, code: 50035 }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}

			if (body.name.length > ScheduledEventLimits.MAX_NAME_LENGTH) {
				return new Response(
					JSON.stringify({ message: `Event name cannot exceed ${ScheduledEventLimits.MAX_NAME_LENGTH} characters`, code: 50035 }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}
		}

		// Validate description length if provided
		if (body.description && body.description.length > ScheduledEventLimits.MAX_DESCRIPTION_LENGTH) {
			return new Response(
				JSON.stringify({ message: `Event description cannot exceed ${ScheduledEventLimits.MAX_DESCRIPTION_LENGTH} characters`, code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Validate status transitions
		if (body.status !== undefined) {
			const validTransitions: Record<GuildScheduledEventStatus, GuildScheduledEventStatus[]> = {
				[GuildScheduledEventStatus.Scheduled]: [GuildScheduledEventStatus.Active, GuildScheduledEventStatus.Canceled],
				[GuildScheduledEventStatus.Active]: [GuildScheduledEventStatus.Completed],
				[GuildScheduledEventStatus.Completed]: [],
				[GuildScheduledEventStatus.Canceled]: []
			}

			if (!validTransitions[event.status].includes(body.status)) {
				return new Response(
					JSON.stringify({ message: `Invalid status transition from ${event.status} to ${body.status}`, code: 50035 }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}
		}

		// Update the scheduled event
		const updatedEvent = session.state.updateScheduledEvent(guildId, eventId, {
			channelId: body.channel_id,
			name: body.name,
			description: body.description,
			scheduledStartTime: body.scheduled_start_time,
			scheduledEndTime: body.scheduled_end_time,
			privacyLevel: body.privacy_level,
			entityType: body.entity_type,
			entityMetadata: body.entity_metadata ? { location: body.entity_metadata.location } : body.entity_metadata,
			status: body.status,
			image: body.image
		})

		if (!updatedEvent) {
			return new Response(JSON.stringify({ message: 'Failed to update scheduled event', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'scheduled_event_updated',
			{
				event_id: eventId,
				guild_id: guildId,
				changes: body
			},
			{
				endpoint: `PATCH /guilds/${guildId}/scheduled-events/${eventId}`,
				method: 'PATCH'
			}
		)

		// Dispatch GUILD_SCHEDULED_EVENT_UPDATE event
		await session.dispatchGuildScheduledEventUpdate(updatedEvent)

		return new Response(JSON.stringify(mockScheduledEventToAPIScheduledEvent(updatedEvent)), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	}
)

export const DELETE = define(
	{
		summary: 'Delete scheduled event',
		description: 'Delete a guild scheduled event',
		tags: ['Guild Scheduled Events'],
		params: scheduledEventParams,
		response: {
			204: z.undefined().describe('Event deleted successfully')
		}
	},
	async (request) => {
		const resolved = resolveScheduledEvent(request)
		if (resolved instanceof Response) return resolved
		const { session, guildId, event, eventId } = resolved

		// Check permissions (MANAGE_EVENTS required)
		const permError = enforcePermissions(session, 'DELETE', `/guilds/${guildId}/scheduled-events/${eventId}`, undefined, guildId)
		if (permError) return permError

		// Delete the scheduled event
		session.state.deleteScheduledEvent(guildId, eventId)

		// Record action
		session.recordAction(
			'scheduled_event_deleted',
			{
				event_id: eventId,
				guild_id: guildId
			},
			{
				endpoint: `DELETE /guilds/${guildId}/scheduled-events/${eventId}`,
				method: 'DELETE'
			}
		)

		// Dispatch GUILD_SCHEDULED_EVENT_DELETE event
		await session.dispatchGuildScheduledEventDelete(event)

		return new Response(null, { status: 204 })
	}
)
