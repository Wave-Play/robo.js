import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../core/manager.js'
import { parseMockToken } from '../../../utils/id.js'
import { mockUserToAPIUser } from '../../../discord/payloads.js'

/**
 * GET /api/v10/applications/:app_id - Get Application
 * PATCH /api/v10/applications/:app_id - Update Application
 *
 * Returns/updates information about the current application (bot).
 * Discord.js uses this for client.application?.fetch() and client.application?.edit()
 *
 * @see https://discord.com/developers/docs/resources/application#get-current-application
 * @see https://discord.com/developers/docs/resources/application#edit-current-application
 */

const UserResponseSchema = z
	.object({
		id: z.string(),
		username: z.string(),
		avatar: z.string().nullable(),
		discriminator: z.string(),
		public_flags: z.number().int(),
		flags: z.number(),
		bot: z.boolean().optional(),
		system: z.boolean().optional(),
		banner: z.string().nullable().optional(),
		accent_color: z.number().int().nullable().optional(),
		global_name: z.string().nullable(),
		avatar_decoration_data: z.object({}).passthrough().nullable().optional(),
		collectibles: z.object({}).passthrough().nullable().optional(),
		primary_guild: z.object({}).passthrough().nullable()
	})
	.passthrough()

const PrivateApplicationResponseSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		icon: z.string().nullable(),
		description: z.string(),
		type: z.number().nullable(),
		bot_public: z.boolean().optional(),
		bot_require_code_grant: z.boolean().optional(),
		verify_key: z.string(),
		owner: UserResponseSchema,
		flags: z.number().int(),
		approximate_guild_count: z.number().int().nullable(),
		approximate_user_install_count: z.number().int(),
		approximate_user_authorization_count: z.number().int(),
		interactions_endpoint_url: z.string().nullable(),
		redirect_uris: z.array(z.string().nullable()),
		role_connections_verification_url: z.string().nullable(),
		explicit_content_filter: z.number().int(),
		team: z.object({}).passthrough().nullable(),
		tags: z.array(z.string()).optional(),
		install_params: z
			.object({
				scopes: z.array(z.string()),
				permissions: z.string()
			})
			.optional(),
		custom_install_url: z.string().optional(),
		cover_image: z.string().optional(),
		primary_sku_id: z.string().optional(),
		slug: z.string().optional(),
		guild_id: z.string().optional(),
		rpc_origins: z.array(z.string().nullable()).optional(),
		terms_of_service_url: z.string().optional(),
		privacy_policy_url: z.string().optional(),
		integration_types_config: z.object({}).passthrough().optional(),
		bot: UserResponseSchema.optional(),
		max_participants: z.number().int().nullable().optional()
	})
	.passthrough()

const ApplicationFormPartialSchema = z
	.object({
		description: z.object({}).passthrough().nullable().optional(),
		icon: z.string().nullable().optional(),
		cover_image: z.string().nullable().optional(),
		team_id: z.string().nullable().optional(),
		flags: z.number().nullable().optional(),
		interactions_endpoint_url: z.string().nullable().optional(),
		explicit_content_filter: z.number().nullable().optional(),
		max_participants: z.number().int().nullable().optional(),
		type: z.number().nullable().optional(),
		tags: z.array(z.string()).nullable().optional(),
		custom_install_url: z.string().nullable().optional(),
		install_params: z
			.object({
				scopes: z.array(z.string()),
				permissions: z.string()
			})
			.nullable()
			.optional(),
		role_connections_verification_url: z.string().nullable().optional(),
		integration_types_config: z.object({}).passthrough().nullable().optional()
	})
	.passthrough()

function resolveApplication(request: RoboRequest) {
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

	const { app_id: appId } = request.params as { app_id: string }
	const botUser = session.state.botUser

	// Verify app ID matches bot user ID (or is @me)
	if (appId !== '@me' && appId !== botUser.id) {
		return new Response(JSON.stringify({ message: 'Unknown Application', code: 10002 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, botUser }
}

function buildApplicationResponse(session: NonNullable<ReturnType<typeof sessionManager.get>>, botUser: NonNullable<ReturnType<typeof sessionManager.get>>['state']['botUser']) {
	return {
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
		approximate_user_authorization_count: 0,
		explicit_content_filter: 0,
		team: null,
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
		rpc_origins: [],
		terms_of_service_url: null,
		privacy_policy_url: null,
		hook: true,
		cover_image: null,
		guild_id: null,
		primary_sku_id: null,
		slug: null
	}
}

export const GET = define(
	{
		summary: 'Get application',
		description: 'Returns the application object for the given application ID',
		tags: ['Applications'],
		params: z.object({
			app_id: z.string().describe('The application ID (Snowflake)')
		}),
		response: {
			200: PrivateApplicationResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveApplication(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, botUser } = resolved

		const application = buildApplicationResponse(session, botUser)

		return new Response(JSON.stringify(application), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	}
)

export const PATCH = define(
	{
		summary: 'Update application',
		description: 'Edit properties of the application associated with the requesting bot user',
		tags: ['Applications'],
		params: z.object({
			app_id: z.string().describe('The application ID (Snowflake)')
		}),
		body: ApplicationFormPartialSchema,
		response: {
			200: PrivateApplicationResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveApplication(request as unknown as RoboRequest)
		if (resolved instanceof Response) return resolved
		const { session, botUser } = resolved

		// Parse body (partial update fields)
		let body: Record<string, unknown>
		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Apply updates to bot user for fields we track
		if (body.description !== undefined && typeof body.description === 'string') {
			// Store description on state if needed; for mock, we just echo it back
		}

		// Build response with any overrides applied
		const application = {
			...buildApplicationResponse(session, botUser),
			...(body.description !== undefined ? { description: typeof body.description === 'string' ? body.description : '' } : {}),
			...(body.icon !== undefined ? { icon: body.icon } : {}),
			...(body.cover_image !== undefined ? { cover_image: body.cover_image } : {}),
			...(body.interactions_endpoint_url !== undefined ? { interactions_endpoint_url: body.interactions_endpoint_url } : {}),
			...(body.tags !== undefined ? { tags: body.tags } : {}),
			...(body.custom_install_url !== undefined ? { custom_install_url: body.custom_install_url } : {}),
			...(body.install_params !== undefined ? { install_params: body.install_params } : {}),
			...(body.role_connections_verification_url !== undefined ? { role_connections_verification_url: body.role_connections_verification_url } : {}),
			...(body.flags !== undefined ? { flags: body.flags } : {}),
			...(body.max_participants !== undefined ? { max_participants: body.max_participants } : {}),
			...(body.integration_types_config !== undefined ? { integration_types_config: body.integration_types_config } : {}),
			...(body.explicit_content_filter !== undefined ? { explicit_content_filter: body.explicit_content_filter } : {})
		}

		return new Response(JSON.stringify(application), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	}
)
