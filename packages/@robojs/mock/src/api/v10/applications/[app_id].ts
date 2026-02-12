import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../core/manager.js'
import { parseMockToken } from '../../../utils/id.js'
import { mockUserToAPIUser } from '../../../discord/payloads.js'

/**
 * GET /api/v10/applications/:app_id - Get Application
 *
 * Returns information about the current application (bot).
 * Discord.js uses this for client.application?.fetch()
 *
 * @see https://discord.com/developers/docs/resources/application#get-current-application
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

	// 2. Extract app ID from params
	const { app_id: appId } = request.params as { app_id: string }

	// Handle GET - Get Application
	if (request.method === 'GET') {
		const botUser = session.state.botUser

		// Verify app ID matches bot user ID (or is @me)
		if (appId !== '@me' && appId !== botUser.id) {
			return new Response(JSON.stringify({ message: 'Unknown Application', code: 10002 }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Build application response with all fields Discord.js expects
		const application = {
			id: botUser.id,
			name: botUser.username,
			icon: botUser.avatar,
			description: '',
			type: null,
			bot_public: true,
			bot_require_code_grant: false,
			verify_key: 'mock_verify_key_' + botUser.id,
			owner: mockUserToAPIUser(botUser),
			flags: 0,
			approximate_guild_count: session.state.guilds.size,
			approximate_user_install_count: 0,
			interactions_endpoint_url: null,
			redirect_uris: [],
			tags: [],
			install_params: {
				scopes: ['bot', 'applications.commands'],
				permissions: '0'
			},
			custom_install_url: null,
			role_connections_verification_url: null,
			integration_types_config: {},
			// Additional fields Discord.js expects
			rpc_origins: [],
			terms_of_service_url: null,
			privacy_policy_url: null,
			hook: true,
			cover_image: null,
			guild_id: null,
			primary_sku_id: null,
			slug: null
		}

		return new Response(JSON.stringify(application), {
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
