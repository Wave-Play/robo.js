import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../core/manager.js'
import { getGatewayServer } from '../../core/gateway.js'
import { parseMockToken } from '../../utils/id.js'
import { StageInstancePrivacyLevel } from '../../types/index.js'

/**
 * Convert MockStageInstance to Discord API format
 */
function stageInstanceToAPI(instance: {
	id: string
	guildId: string
	channelId: string
	topic: string
	privacyLevel: number
	discoverableDisabled: boolean
	guildScheduledEventId?: string | null
}) {
	return {
		id: instance.id,
		guild_id: instance.guildId,
		channel_id: instance.channelId,
		topic: instance.topic,
		privacy_level: instance.privacyLevel,
		discoverable_disabled: instance.discoverableDisabled,
		guild_scheduled_event_id: instance.guildScheduledEventId ?? null
	}
}

/**
 * POST /api/v10/stage-instances - Create a stage instance
 *
 * Request body:
 * {
 *   channel_id: string      // Required: The stage channel ID
 *   topic: string           // Required: The topic (1-120 characters)
 *   privacy_level?: number  // Optional: 1 (Public) or 2 (GuildOnly, default)
 *   send_start_notification?: boolean
 *   guild_scheduled_event_id?: string
 * }
 *
 * @see https://discord.com/developers/docs/resources/stage-instance#create-stage-instance
 */
export async function POST(request: RoboRequest) {
	// Extract session from Authorization header
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

	// Parse request body
	let body: {
		channel_id: string
		topic: string
		privacy_level?: number
		send_start_notification?: boolean
		guild_scheduled_event_id?: string
	}

	try {
		body = await request.json()
	} catch {
		return new Response(JSON.stringify({ message: 'Invalid JSON body', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Validate required fields
	if (!body.channel_id) {
		return new Response(JSON.stringify({ message: 'Missing channel_id', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	if (!body.topic) {
		return new Response(JSON.stringify({ message: 'Missing topic', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Validate topic length
	if (body.topic.length < 1 || body.topic.length > 120) {
		return new Response(JSON.stringify({ message: 'Topic must be between 1 and 120 characters', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Find the channel
	const channel = session.state.channels.get(body.channel_id)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Validate channel is a stage channel
	if (channel.type !== 13) {
		// 13 = GUILD_STAGE_VOICE
		return new Response(JSON.stringify({ message: 'Channel is not a stage channel', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Check if stage instance already exists
	if (session.state.getStageInstance(body.channel_id)) {
		return new Response(JSON.stringify({ message: 'Stage instance already exists for this channel', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Create the stage instance
	const stageInstance = session.state.createStageInstance(channel.guildId!, {
		channelId: body.channel_id,
		topic: body.topic,
		privacyLevel: body.privacy_level ?? StageInstancePrivacyLevel.GuildOnly,
		sendStartNotification: body.send_start_notification,
		guildScheduledEventId: body.guild_scheduled_event_id
	})

	if (!stageInstance) {
		return new Response(JSON.stringify({ message: 'Failed to create stage instance', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Record action
	session.recordAction('stage_instance_created', {
		stage_instance_id: stageInstance.id,
		channel_id: stageInstance.channelId,
		guild_id: stageInstance.guildId,
		topic: stageInstance.topic
	})

	// Dispatch STAGE_INSTANCE_CREATE event
	const apiPayload = stageInstanceToAPI(stageInstance)
	getGatewayServer().dispatchToSession(session.id, 'STAGE_INSTANCE_CREATE', apiPayload, stageInstance.guildId)

	return new Response(JSON.stringify(apiPayload), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	})
}
