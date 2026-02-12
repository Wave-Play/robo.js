import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { parseMockToken } from '../../../../utils/id.js'
import { mockInviteToAPIExtendedInvite } from '../../../../discord/payloads.js'
import { InviteLimits, InviteTargetType } from '../../../../types/index.js'
import { enforcePermissions } from '../../../../utils/permission-check.js'

/**
 * GET /api/v10/channels/:id/invites - List all invites for a channel
 * POST /api/v10/channels/:id/invites - Create a new invite for a channel
 *
 * @see https://discord.com/developers/docs/resources/channel#get-channel-invites
 * @see https://discord.com/developers/docs/resources/channel#create-channel-invite
 */
function resolveChannelForInvites(request: RoboRequest) {
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

	const { id: channelId } = request.params as { id: string }

	const channel = session.state.getChannel(channelId)
	if (!channel) {
		return new Response(JSON.stringify({ message: 'Unknown Channel', code: 10003 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, channel, channelId }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveChannelForInvites(request)
	if (resolved instanceof Response) return resolved
	const { session, channelId } = resolved

	// Check permissions (MANAGE_CHANNELS required)
	const permError = enforcePermissions(session, 'GET', `/channels/${channelId}/invites`, channelId)
	if (permError) return permError

	// Get all invites for the channel
	const invites = session.state.getChannelInvites(channelId)

	// Convert to API format
	const apiInvites = invites.map((invite) => mockInviteToAPIExtendedInvite(invite, session.state))

	return apiInvites
}

export async function POST(request: RoboRequest) {
	const resolved = resolveChannelForInvites(request)
	if (resolved instanceof Response) return resolved
	const { session, channel, channelId } = resolved

	// Check permissions (CREATE_INSTANT_INVITE required)
	const permError = enforcePermissions(session, 'POST', `/channels/${channelId}/invites`, channelId)
	if (permError) return permError

	// Parse request body
	let body: {
		max_age?: number
		max_uses?: number
		temporary?: boolean
		unique?: boolean
		target_type?: InviteTargetType
		target_user_id?: string
		target_application_id?: string
	} = {}

	try {
		const text = await request.text()
		if (text) {
			body = JSON.parse(text)
		}
	} catch {
		return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Validate max_age
	const maxAge = body.max_age ?? InviteLimits.DEFAULT_MAX_AGE
	if (maxAge < 0 || maxAge > InviteLimits.MAX_AGE) {
		return new Response(
			JSON.stringify({ message: `max_age must be between 0 and ${InviteLimits.MAX_AGE}`, code: 50035 }),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// Validate max_uses (default is 0 = unlimited)
	const maxUses = body.max_uses ?? 0
	if (maxUses < 0 || maxUses > InviteLimits.MAX_USES) {
		return new Response(
			JSON.stringify({ message: `max_uses must be between 0 and ${InviteLimits.MAX_USES}`, code: 50035 }),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// Validate target_type requirements
	if (body.target_type === InviteTargetType.Stream && !body.target_user_id) {
		return new Response(
			JSON.stringify({ message: 'target_user_id is required when target_type is STREAM', code: 50035 }),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	if (body.target_type === InviteTargetType.EmbeddedApplication && !body.target_application_id) {
		return new Response(
			JSON.stringify({
				error: 'target_application_id is required when target_type is EMBEDDED_APPLICATION',
				code: 50035
			}),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// Create the invite (expires_at is calculated internally based on maxAge)
	const invite = session.state.createInvite(
		channel.guildId!,
		channelId,
		{
			maxAge,
			maxUses,
			temporary: body.temporary ?? false,
			unique: body.unique ?? false,
			targetType: body.target_type,
			targetUserId: body.target_user_id,
			targetApplicationId: body.target_application_id
		},
		session.state.botUser.id
	)

	if (!invite) {
		return new Response(JSON.stringify({ message: 'Failed to create invite', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Record action
	session.recordAction(
		'invite_created',
		{
			code: invite.code,
			channel_id: channelId,
			guild_id: channel.guildId,
			max_age: maxAge,
			max_uses: maxUses
		},
		{
			endpoint: `POST /channels/${channelId}/invites`,
			method: 'POST'
		}
	)

	// Dispatch INVITE_CREATE event
	await session.dispatchInviteCreate(invite)

	// Return the invite (extended format includes metadata)
	return new Response(JSON.stringify(mockInviteToAPIExtendedInvite(invite, session.state)), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	})
}
