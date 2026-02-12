import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { notFound, badRequest } from '../../../utils.js'
import { computePermissions, getPermissionNames, hasPermission, PermissionFlagsBits } from '../../../../../core/permissions.js'

/**
 * GET /api/control/sessions/:id/permissions/:channelId - Get computed permissions for a channel
 *
 * Query Parameters:
 * - user_id: User ID to compute permissions for (default: bot user)
 *
 * Response:
 * {
 *   channel_id: string,
 *   guild_id: string,
 *   user_id: string,
 *   permissions: string,
 *   permission_names: string[],
 *   can: {
 *     view_channel: boolean,
 *     send_messages: boolean,
 *     manage_messages: boolean,
 *     ...
 *   }
 * }
 *
 * @see Plan Step 7: Control API for Permission Testing
 */
export async function GET(request: RoboRequest) {
	const { id, channelId } = request.params as { id: string; channelId: string }

	if (!id) {
		return notFound('Session ID required')
	}

	if (!channelId) {
		return notFound('Channel ID required')
	}

	const session = sessionManager.get(id)

	if (!session) {
		return notFound('Session not found')
	}

	const channel = session.state.channels.get(channelId)
	if (!channel) {
		return notFound('Channel not found')
	}

	// DM channels don't have guild permissions
	if (!channel.guildId) {
		return badRequest('Cannot compute permissions for DM channel')
	}

	const guild = session.state.guilds.get(channel.guildId)
	if (!guild) {
		return notFound('Guild not found')
	}

	// Get user ID from query params or default to bot user
	const url = new URL(request.url, 'http://localhost')
	const userId = url.searchParams.get('user_id') || session.state.botUser?.id

	if (!userId) {
		return badRequest('No user ID provided and no bot user in session')
	}

	// Get member
	const member = session.state.getGuildMember(channel.guildId, userId)
	if (!member) {
		return notFound('User is not a member of this guild')
	}

	// Get all roles for computation
	const roles = session.state.getGuildRoles(channel.guildId)

	// Compute permissions
	const permissions = computePermissions(member, channel, guild, roles)

	// Build permission check map for common permissions
	const can: Record<string, boolean> = {
		view_channel: hasPermission(permissions, PermissionFlagsBits.ViewChannel),
		send_messages: hasPermission(permissions, PermissionFlagsBits.SendMessages),
		send_tts_messages: hasPermission(permissions, PermissionFlagsBits.SendTTSMessages),
		manage_messages: hasPermission(permissions, PermissionFlagsBits.ManageMessages),
		embed_links: hasPermission(permissions, PermissionFlagsBits.EmbedLinks),
		attach_files: hasPermission(permissions, PermissionFlagsBits.AttachFiles),
		read_message_history: hasPermission(permissions, PermissionFlagsBits.ReadMessageHistory),
		mention_everyone: hasPermission(permissions, PermissionFlagsBits.MentionEveryone),
		use_external_emojis: hasPermission(permissions, PermissionFlagsBits.UseExternalEmojis),
		add_reactions: hasPermission(permissions, PermissionFlagsBits.AddReactions),
		connect: hasPermission(permissions, PermissionFlagsBits.Connect),
		speak: hasPermission(permissions, PermissionFlagsBits.Speak),
		mute_members: hasPermission(permissions, PermissionFlagsBits.MuteMembers),
		deafen_members: hasPermission(permissions, PermissionFlagsBits.DeafenMembers),
		move_members: hasPermission(permissions, PermissionFlagsBits.MoveMembers),
		use_vad: hasPermission(permissions, PermissionFlagsBits.UseVAD),
		manage_channels: hasPermission(permissions, PermissionFlagsBits.ManageChannels),
		manage_roles: hasPermission(permissions, PermissionFlagsBits.ManageRoles),
		manage_webhooks: hasPermission(permissions, PermissionFlagsBits.ManageWebhooks),
		create_instant_invite: hasPermission(permissions, PermissionFlagsBits.CreateInstantInvite),
		use_application_commands: hasPermission(permissions, PermissionFlagsBits.UseApplicationCommands),
		manage_threads: hasPermission(permissions, PermissionFlagsBits.ManageThreads),
		create_public_threads: hasPermission(permissions, PermissionFlagsBits.CreatePublicThreads),
		create_private_threads: hasPermission(permissions, PermissionFlagsBits.CreatePrivateThreads),
		send_messages_in_threads: hasPermission(permissions, PermissionFlagsBits.SendMessagesInThreads),
		administrator: hasPermission(permissions, PermissionFlagsBits.Administrator)
	}

	// Get channel overwrites for reference
	const overwrites = session.state.getChannelOverwrites(channelId)

	return {
		channel_id: channelId,
		guild_id: channel.guildId,
		user_id: userId,
		permissions: permissions.toString(),
		permission_names: getPermissionNames(permissions),
		can,
		overwrites: overwrites.map((o) => ({
			id: o.id,
			type: o.type,
			allow: o.allow,
			deny: o.deny
		})),
		member_roles: member.roles
	}
}
