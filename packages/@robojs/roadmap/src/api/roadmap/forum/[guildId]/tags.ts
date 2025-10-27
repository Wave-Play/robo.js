import { updateForumTagsForColumn, getForumChannelForColumn } from '../../../../core/forum-manager.js'
import { getGuildFromRequest, success, wrapHandler, validateMethod, ERROR_CODES } from '../../utils.js'
import type { RoboRequest } from '@robojs/server'

/**
 * Request body for tag updates
 */
interface TagsRequest {
	columnName: string
	tags: string[]
}

/**
 * Forum tags update endpoint
 *
 * Updates tags for a specific forum channel (column).
 *
 * @route PUT /api/roadmap/forum/:guildId/tags
 * @param guildId - Guild ID from path parameters
 * @body columnName - Which forum/column to update tags for (e.g., 'Backlog', 'In Progress', 'Done')
 * @body tags - Array of tag names to add
 * @returns Updated tag information
 * @note Discord has a limit of 20 tags per forum channel
 *
 * @example
 * ```json
 * {
 *   "columnName": "Backlog",
 *   "tags": ["Feature", "Bug", "Enhancement"]
 * }
 * ```
 */
export default wrapHandler(async (request: RoboRequest) => {
	// Only allow PUT requests
	validateMethod(request, ['PUT'])

	// Get guild from request parameters
	const guild = await getGuildFromRequest(request)

	// Parse and validate JSON body
	let body: TagsRequest
	try {
		body = (await request.json()) as TagsRequest
	} catch {
		const err = new Error('Invalid JSON body')
		err.name = ERROR_CODES.INVALID_REQUEST
		throw err
	}

	// Extract columnName and tags from request body
	const { columnName, tags } = body

	// Validate columnName
	if (!columnName || typeof columnName !== 'string') {
		const err = new Error('columnName must be a non-empty string')
		err.name = ERROR_CODES.INVALID_REQUEST
		throw err
	}

	// Validate tags array
	if (!Array.isArray(tags) || tags.length === 0) {
		const err = new Error('tags must be a non-empty array of tag names')
		err.name = ERROR_CODES.INVALID_REQUEST
		throw err
	}

	try {
		// Update forum tags for the specified column
		await updateForumTagsForColumn(guild, columnName, tags)

		// Fetch the forum to get the total tag count
		const forum = await getForumChannelForColumn(guild, columnName)
		const total = forum?.availableTags.length ?? 0

		// Build tags update result response
		const tagsResult = {
			columnName,
			added: tags.length,
			total,
			message: `Successfully updated tags for ${columnName} forum. Note: Discord limits forums to 20 tags maximum.`
		}

		return success(tagsResult)
	} catch (err) {
		// Handle specific errors from updateForumTags
		if (err instanceof Error) {
			// Map forum setup errors
			if (err.message.includes('not set up')) {
				const setupErr = new Error(err.message)
				setupErr.name = ERROR_CODES.FORUM_NOT_SETUP
				throw setupErr
			}

			// Map permission errors
			if (err.message.includes('Missing Permissions')) {
				const permErr = new Error('Bot lacks Manage Channels permission')
				permErr.name = ERROR_CODES.MISSING_PERMISSIONS
				throw permErr
			}
		}

		throw err
	}
})
