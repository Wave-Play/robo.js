import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../core/manager.js'
import { parseMockToken } from '../../../utils/id.js'
import { mockInviteToAPIInvite, mockInviteToAPIExtendedInvite } from '../../../discord/payloads.js'
import { enforcePermissions } from '../../../utils/permission-check.js'

/**
 * GET /api/v10/invites/:code - Get an invite by code
 * DELETE /api/v10/invites/:code - Delete an invite
 *
 * GET: Returns an invite object for the given code.
 * DELETE: Deletes an invite. Requires the MANAGE_CHANNELS permission on the channel,
 *         or MANAGE_GUILD to remove any invite in the guild.
 *
 * @see https://discord.com/developers/docs/resources/invite#get-invite
 * @see https://discord.com/developers/docs/resources/invite#delete-invite
 */

function resolveInvite(request: RoboRequest) {
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

	// 2. Extract invite code from params
	const { code } = request.params as { code: string }

	// 3. Get the invite
	const invite = session.state.getInvite(code)
	if (!invite) {
		return new Response(JSON.stringify({ message: 'Unknown Invite', code: 10006 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, code, invite }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveInvite(request)
	if (resolved instanceof Response) return resolved
	const { session, invite } = resolved

	// Parse query parameters for optional data
	const url = new URL(request.url)
	const withCounts = url.searchParams.get('with_counts') === 'true'
	const withExpiration = url.searchParams.get('with_expiration') === 'true'
	const guildScheduledEventId = url.searchParams.get('guild_scheduled_event_id')

	// Build the response based on query params
	if (withCounts || withExpiration) {
		// Extended invite with metadata
		const apiInvite = mockInviteToAPIExtendedInvite(invite, session.state)

		// Include scheduled event if requested
		if (guildScheduledEventId && invite.guildId) {
			const event = session.state.getScheduledEvent(invite.guildId, guildScheduledEventId)
			if (event) {
				// Would add guild_scheduled_event to response
				// For now, we just acknowledge the parameter
			}
		}

		return apiInvite
	}

	// Basic invite
	return mockInviteToAPIInvite(invite, session.state)
}

export async function DELETE(request: RoboRequest) {
	const resolved = resolveInvite(request)
	if (resolved instanceof Response) return resolved
	const { session, code, invite } = resolved

	// Check permissions (MANAGE_CHANNELS on the channel or MANAGE_GUILD)
	const permError = enforcePermissions(
		session,
		'DELETE',
		`/invites/${code}`,
		invite.channelId,
		invite.guildId
	)
	if (permError) return permError

	// Get the invite data before deletion for the response
	const apiInvite = mockInviteToAPIInvite(invite, session.state)

	// Delete the invite
	session.state.deleteInvite(code)

	// Record action
	session.recordAction(
		'invite_deleted',
		{
			code,
			channel_id: invite.channelId,
			guild_id: invite.guildId
		},
		{
			endpoint: `DELETE /invites/${code}`,
			method: 'DELETE'
		}
	)

	// Dispatch INVITE_DELETE event
	await session.dispatchInviteDelete(invite)

	// Return the deleted invite
	return apiInvite
}
