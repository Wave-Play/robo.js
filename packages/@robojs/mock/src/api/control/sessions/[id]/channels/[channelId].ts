import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../core/manager.js'
import { notFound } from '../../../utils.js'
import { serializeMockMessage } from '../../../../../session/state.js'
import type { MockForumChannel, MockForumThread } from '../../../../../types/index.js'

/**
 * GET /api/control/sessions/:id/channels/:channelId - Get channel details
 *
 * Query Parameters:
 * - include_messages: Include recent messages (default: false)
 * - message_limit: Max messages to include (default: 50, max: 100)
 *
 * Response:
 * {
 *   id: string,
 *   guild_id?: string,
 *   name: string,
 *   type: number,
 *   parent_id?: string,
 *   message_count: number,
 *   messages?: SerializedMockMessage[],
 *   // Forum channel fields:
 *   topic?: string,
 *   available_tags?: SerializedMockForumTag[],
 *   default_auto_archive_duration?: number,
 *   default_sort_order?: number,
 *   default_forum_layout?: number,
 *   template?: string,
 *   // Forum thread fields:
 *   applied_tags?: string[]
 * }
 */
export async function GET(request: RoboRequest) {
	const { id, channelId } = request.params as { id: string; channelId: string }
	const url = new URL(request.url, 'http://localhost')
	const includeMessages = url.searchParams.get('include_messages') === 'true'
	const messageLimit = Math.min(parseInt(url.searchParams.get('message_limit') ?? '50', 10), 100)

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

	const channel = session.state.getChannel(channelId)

	if (!channel) {
		return notFound('Channel not found')
	}

	// Count messages in this channel
	const channelMessages = session.state.getMessagesForChannel(channelId)
	const messageCount = channelMessages.length

	// Build response
	const result: Record<string, unknown> = {
		id: channel.id,
		guild_id: channel.guildId,
		name: channel.name,
		type: channel.type,
		parent_id: channel.parentId,
		message_count: messageCount
	}

	// Include forum channel fields
	if (channel.type === 15 || channel.type === 16) {
		const forumChannel = channel as MockForumChannel
		result.topic = forumChannel.topic
		result.available_tags = forumChannel.available_tags.map((tag) => ({
			id: tag.id,
			name: tag.name,
			moderated: tag.moderated,
			emoji_id: tag.emoji_id,
			emoji_name: tag.emoji_name
		}))
		result.default_auto_archive_duration = forumChannel.default_auto_archive_duration
		result.default_thread_rate_limit_per_user = forumChannel.default_thread_rate_limit_per_user
		result.default_sort_order = forumChannel.default_sort_order
		result.default_forum_layout = forumChannel.default_forum_layout
		result.default_reaction_emoji = forumChannel.default_reaction_emoji
		result.template = forumChannel.template
	}

	// Include forum thread fields
	if (channel.type === 10 || channel.type === 11 || channel.type === 12) {
		// Check if this thread belongs to a forum channel
		const parentChannel = session.state.getChannel(channel.parentId!)
		if (parentChannel && (parentChannel.type === 15 || parentChannel.type === 16)) {
			const forumThread = channel as unknown as MockForumThread
			result.applied_tags = forumThread.applied_tags ?? []
		}
	}

	// Include messages if requested
	if (includeMessages) {
		const messages = channelMessages.slice(0, messageLimit)
		result.messages = messages.map((msg) => {
			const serialized = serializeMockMessage(msg)
			// Include author info for convenience (especially for tests)
			const author = session.state.getUser(msg.authorId)
			return {
				...serialized,
				author: author
					? {
							id: author.id,
							username: author.username,
							bot: author.bot ?? false
						}
					: { id: msg.authorId, bot: msg.authorId === session.state.botUser.id }
			}
		})
	}

	return result
}
