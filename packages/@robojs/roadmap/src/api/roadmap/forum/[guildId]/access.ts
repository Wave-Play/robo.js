import { toggleForumAccess } from '../../../../core/forum-manager.js'
import { getGuildFromRequest, success, wrapHandler, validateMethod, ERROR_CODES } from '../../utils.js'
import type { RoboRequest } from '@robojs/server'

/**
 * Request body for access control
 */
interface AccessRequest {
	mode: 'public' | 'private'
}

/**
 * Roadmap category access control endpoint
 *
 * Toggles access for the entire roadmap category, which cascades to all forum channels.
 * Public mode allows users to comment on existing threads (SendMessagesInThreads: true)
 * but prevents creating new threads (CreatePublicThreads: false).
 *
 * @route PUT /api/roadmap/forum/:guildId/access
 * @param guildId - Guild ID from path parameters
 * @body mode - Target access mode ('public' or 'private')
 * @returns Updated access mode information
 */
export default wrapHandler(async (request: RoboRequest) => {
	// Only allow PUT requests
	validateMethod(request, ['PUT'])

	// Get guild from request parameters
	const guild = await getGuildFromRequest(request)

	// Parse and validate JSON body
	let body: AccessRequest
	try {
		body = (await request.json()) as AccessRequest
	} catch {
		const err = new Error('Invalid JSON body')
		err.name = ERROR_CODES.INVALID_REQUEST
		throw err
	}

	// Extract mode from request body
	const { mode } = body

	// Validate mode value
	if (!mode || (mode !== 'public' && mode !== 'private')) {
		const err = new Error(`Invalid mode: ${mode}. Must be 'public' or 'private'`)
		err.name = ERROR_CODES.INVALID_REQUEST
		throw err
	}

	try {
		// Apply access control to category and forums
		await toggleForumAccess(guild, mode)

		// Build access control result response
		const accessResult = {
			mode,
			message: `Category and all forum channels changed to ${mode} mode. ${mode === 'public' ? 'Users can now comment on existing threads.' : ''}`
		}

		return success(accessResult)
	} catch (err) {
		// Handle specific errors from toggleForumAccess
		if (err instanceof Error) {
			const errorMessage = err.message.toLowerCase()

			// Map forum setup errors
			if (
				errorMessage.includes('not set up') ||
				errorMessage.includes('no roadmap category configured') ||
				errorMessage.includes('category not found')
			) {
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
