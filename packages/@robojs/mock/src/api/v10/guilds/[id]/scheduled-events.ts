import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { mockScheduledEventToAPIScheduledEvent } from '../../../../discord/payloads.js'
import {
	GuildScheduledEventEntityType,
	GuildScheduledEventPrivacyLevel,
	ScheduledEventLimits
} from '../../../../types/index.js'
import { enforcePermissions } from '../../../../utils/permission-check.js'

/**
 * GET /api/v10/guilds/:id/scheduled-events - List scheduled events for a guild
 * POST /api/v10/guilds/:id/scheduled-events - Create a guild scheduled event
 *
 * @see https://discord.com/developers/docs/resources/guild-scheduled-event#list-scheduled-events-for-guild
 * @see https://discord.com/developers/docs/resources/guild-scheduled-event#create-guild-scheduled-event
 */
export default async (request: RoboRequest) => {
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

	// 2. Extract guild ID from params
	const { id: guildId } = request.params as { id: string }

	// 3. Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Handle GET - List scheduled events
	if (request.method === 'GET') {
		// Parse query parameter
		const url = new URL(request.url)
		const withUserCount = url.searchParams.get('with_user_count') === 'true'

		// Get all scheduled events for the guild
		const events = session.state.getGuildScheduledEvents(guildId)

		// Convert to API format
		const apiEvents = events.map((event) => {
			const apiEvent = mockScheduledEventToAPIScheduledEvent(event)
			if (withUserCount) {
				apiEvent.user_count = event.subscribers.size
			}
			return apiEvent
		})

		return apiEvents
	}

	// Handle POST - Create scheduled event
	if (request.method === 'POST') {
		// Check permissions (MANAGE_EVENTS required)
		const permError = enforcePermissions(session, 'POST', `/guilds/${guildId}/scheduled-events`, undefined, guildId)
		if (permError) return permError

		// Parse request body
		let body: {
			channel_id?: string
			entity_metadata?: { location?: string }
			name: string
			privacy_level: GuildScheduledEventPrivacyLevel
			scheduled_start_time: string
			scheduled_end_time?: string
			description?: string
			entity_type: GuildScheduledEventEntityType
			image?: string
		}

		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate required fields
		if (!body.name) {
			return new Response(JSON.stringify({ message: 'name is required', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		if (!body.scheduled_start_time) {
			return new Response(JSON.stringify({ message: 'scheduled_start_time is required', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		if (!body.entity_type) {
			return new Response(JSON.stringify({ message: 'entity_type is required', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate name length
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

		// Validate entity type specific requirements
		if (body.entity_type === GuildScheduledEventEntityType.External) {
			// External events require location and end time
			if (!body.entity_metadata?.location) {
				return new Response(
					JSON.stringify({ message: 'entity_metadata.location is required for EXTERNAL events', code: 50035 }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}

			if (body.entity_metadata.location.length > ScheduledEventLimits.MAX_LOCATION_LENGTH) {
				return new Response(
					JSON.stringify({ message: `Location cannot exceed ${ScheduledEventLimits.MAX_LOCATION_LENGTH} characters`, code: 50035 }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}

			if (!body.scheduled_end_time) {
				return new Response(
					JSON.stringify({ message: 'scheduled_end_time is required for EXTERNAL events', code: 50035 }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}
		} else {
			// Stage or Voice events require channel_id
			if (!body.channel_id) {
				return new Response(
					JSON.stringify({ message: 'channel_id is required for STAGE_INSTANCE and VOICE events', code: 50035 }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}

			// Validate channel exists
			const channel = session.state.getChannel(body.channel_id)
			if (!channel) {
				return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
					status: 404,
					headers: { 'Content-Type': 'application/json' }
				})
			}
		}

		// Create the scheduled event
		const event = session.state.createScheduledEvent(
			guildId,
			{
				channelId: body.channel_id ?? undefined,
				name: body.name,
				description: body.description,
				scheduledStartTime: body.scheduled_start_time,
				scheduledEndTime: body.scheduled_end_time,
				privacyLevel: body.privacy_level ?? GuildScheduledEventPrivacyLevel.GuildOnly,
				entityType: body.entity_type,
				entityMetadata: body.entity_metadata ? { location: body.entity_metadata.location } : undefined,
				image: body.image
			},
			session.state.botUser.id
		)

		if (!event) {
			return new Response(JSON.stringify({ message: 'Failed to create scheduled event', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'scheduled_event_created',
			{
				event_id: event.id,
				guild_id: guildId,
				name: event.name,
				entity_type: event.entityType
			},
			{
				endpoint: `POST /guilds/${guildId}/scheduled-events`,
				method: 'POST'
			}
		)

		// Dispatch GUILD_SCHEDULED_EVENT_CREATE event
		await session.dispatchGuildScheduledEventCreate(event)

		return new Response(JSON.stringify(mockScheduledEventToAPIScheduledEvent(event)), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Method not allowed
	return new Response(JSON.stringify({ message: 'Method not allowed' }), {
		status: 405,
		headers: { 'Content-Type': 'application/json' }
	})
}
