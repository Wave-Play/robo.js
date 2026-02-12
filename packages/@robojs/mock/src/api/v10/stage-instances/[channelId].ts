import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../core/manager.js'
import { getGatewayServer } from '../../../core/gateway.js'
import { parseMockToken } from '../../../utils/id.js'
import { StageInstancePrivacyLevel } from '../../../types/index.js'

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
 * GET /api/v10/stage-instances/:channelId - Get a stage instance
 * PATCH /api/v10/stage-instances/:channelId - Modify a stage instance
 * DELETE /api/v10/stage-instances/:channelId - Delete a stage instance
 *
 * @see https://discord.com/developers/docs/resources/stage-instance#get-stage-instance
 * @see https://discord.com/developers/docs/resources/stage-instance#modify-stage-instance
 * @see https://discord.com/developers/docs/resources/stage-instance#delete-stage-instance
 */

function resolveStageInstance(request: RoboRequest) {
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

	const { channelId } = request.params as { channelId: string }

	// Get the stage instance
	const stageInstance = session.state.getStageInstance(channelId)
	if (!stageInstance) {
		return new Response(JSON.stringify({ message: 'Unknown Stage Instance', code: 10067 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, channelId, stageInstance }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveStageInstance(request)
	if (resolved instanceof Response) return resolved
	const { stageInstance } = resolved

	return new Response(JSON.stringify(stageInstanceToAPI(stageInstance)), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	})
}

export async function PATCH(request: RoboRequest) {
	const resolved = resolveStageInstance(request)
	if (resolved instanceof Response) return resolved
	const { session, channelId } = resolved

	let body: {
		topic?: string
		privacy_level?: number
	}

	try {
		body = await request.json()
	} catch {
		return new Response(JSON.stringify({ message: 'Invalid JSON body', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Validate topic if provided
	if (body.topic !== undefined) {
		if (body.topic.length < 1 || body.topic.length > 120) {
			return new Response(JSON.stringify({ message: 'Topic must be between 1 and 120 characters', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}
	}

	// Update the stage instance
	const updatedInstance = session.state.updateStageInstance(channelId, {
		topic: body.topic,
		privacyLevel: body.privacy_level as StageInstancePrivacyLevel | undefined
	})

	if (!updatedInstance) {
		return new Response(JSON.stringify({ message: 'Failed to update stage instance', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Record action
	session.recordAction('stage_instance_updated', {
		stage_instance_id: updatedInstance.id,
		channel_id: updatedInstance.channelId,
		guild_id: updatedInstance.guildId,
		changes: body
	})

	// Dispatch STAGE_INSTANCE_UPDATE event
	const apiPayload = stageInstanceToAPI(updatedInstance)
	getGatewayServer().dispatchToSession(session.id, 'STAGE_INSTANCE_UPDATE', apiPayload, updatedInstance.guildId)

	return new Response(JSON.stringify(apiPayload), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	})
}

export async function DELETE(request: RoboRequest) {
	const resolved = resolveStageInstance(request)
	if (resolved instanceof Response) return resolved
	const { session, channelId } = resolved

	const deletedInstance = session.state.deleteStageInstance(channelId)

	if (!deletedInstance) {
		return new Response(JSON.stringify({ message: 'Failed to delete stage instance', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Record action
	session.recordAction('stage_instance_deleted', {
		stage_instance_id: deletedInstance.id,
		channel_id: deletedInstance.channelId,
		guild_id: deletedInstance.guildId
	})

	// Dispatch STAGE_INSTANCE_DELETE event
	const apiPayload = stageInstanceToAPI(deletedInstance)
	getGatewayServer().dispatchToSession(session.id, 'STAGE_INSTANCE_DELETE', apiPayload, deletedInstance.guildId)

	return new Response(null, { status: 204 })
}
