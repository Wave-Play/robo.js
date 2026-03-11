import { define } from '@robojs/server'
import type { RoboRequest } from '@robojs/server'
import { z } from 'zod'
import { sessionManager } from '../../../../../core/manager.js'
import { parseMockToken } from '../../../../../utils/id.js'
import { mockAutoModRuleToAPIAutoModRule } from '../../../../../discord/payloads.js'
import {
	AutoModerationEventType,
	AutoModerationTriggerType,
	AutoModerationActionType,
	AutoModLimits
} from '../../../../../types/index.js'
import { enforcePermissions } from '../../../../../utils/permission-check.js'

/**
 * GET /api/v10/guilds/:id/auto-moderation/rules - List auto moderation rules for a guild
 * POST /api/v10/guilds/:id/auto-moderation/rules - Create an auto moderation rule
 *
 * @see https://discord.com/developers/docs/resources/auto-moderation#list-auto-moderation-rules-for-guild
 * @see https://discord.com/developers/docs/resources/auto-moderation#create-auto-moderation-rule
 */
function resolveGuild(request: RoboRequest) {
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

	// 2. Extract guild ID from params
	const { id: guildId } = request.params as { id: string }

	// 3. Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, guild, guildId }
}

const AutoModActionSchema = z
	.object({
		type: z.number(),
		metadata: z
			.object({
				channel_id: z.string().optional(),
				duration_seconds: z.number().optional(),
				custom_message: z.string().optional()
			})
			.passthrough()
			.optional()
	})
	.passthrough()

const AutoModRuleResponseSchema = z
	.object({
		id: z.string(),
		guild_id: z.string(),
		creator_id: z.string(),
		name: z.string(),
		event_type: z.number(),
		actions: z.array(AutoModActionSchema),
		trigger_type: z.number(),
		enabled: z.boolean(),
		exempt_roles: z.array(z.string()),
		exempt_channels: z.array(z.string()),
		trigger_metadata: z.object({}).passthrough()
	})
	.passthrough()

export const GET = define(
	{
		summary: 'List auto-moderation rules',
		description: 'Get a list of all rules currently configured for the guild',
		tags: ['Auto Moderation'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		response: {
			200: z.array(AutoModRuleResponseSchema)
		}
	},
	async (request) => {
		const resolved = resolveGuild(request)
		if (resolved instanceof Response) return resolved
		const { session, guildId } = resolved

		// Check permissions (MANAGE_GUILD required)
		const permError = enforcePermissions(session, 'GET', `/guilds/${guildId}/auto-moderation/rules`, undefined, guildId)
		if (permError) return permError

		// Get all auto moderation rules for the guild
		const rules = session.state.getGuildAutoModRules(guildId)

		// Convert to API format
		const apiRules = rules.map(mockAutoModRuleToAPIAutoModRule)

		return apiRules
	}
)

export const POST = define(
	{
		summary: 'Create auto-moderation rule',
		description: 'Create a new rule for the guild',
		tags: ['Auto Moderation'],
		params: z.object({
			id: z.string().describe('The guild ID (Snowflake)')
		}),
		body: z
			.object({
				name: z.string().max(100),
				event_type: z.number(),
				trigger_type: z.number(),
				trigger_metadata: z
					.object({
						keyword_filter: z.array(z.string()).optional(),
						regex_patterns: z.array(z.string()).optional(),
						presets: z.array(z.number()).optional(),
						allow_list: z.array(z.string()).optional(),
						mention_total_limit: z.number().optional(),
						mention_raid_protection_enabled: z.boolean().optional()
					})
					.passthrough()
					.optional(),
				actions: z.array(AutoModActionSchema).nullable().optional(),
				enabled: z.boolean().nullable().optional(),
				exempt_roles: z.array(z.string()).nullable().optional(),
				exempt_channels: z.array(z.string()).nullable().optional()
			})
			.passthrough(),
		response: {
			200: AutoModRuleResponseSchema
		}
	},
	async (request) => {
		const resolved = resolveGuild(request)
		if (resolved instanceof Response) return resolved
		const { session, guildId } = resolved

		// Check permissions (MANAGE_GUILD required)
		const permError = enforcePermissions(session, 'POST', `/guilds/${guildId}/auto-moderation/rules`, undefined, guildId)
		if (permError) return permError

		// Parse request body
		let body: {
			name: string
			event_type: AutoModerationEventType
			trigger_type: AutoModerationTriggerType
			trigger_metadata?: {
				keyword_filter?: string[]
				regex_patterns?: string[]
				presets?: number[]
				allow_list?: string[]
				mention_total_limit?: number
				mention_raid_protection_enabled?: boolean
			}
			actions: Array<{
				type: AutoModerationActionType
				metadata?: {
					channel_id?: string
					duration_seconds?: number
					custom_message?: string
				}
			}>
			enabled?: boolean
			exempt_roles?: string[]
			exempt_channels?: string[]
		}

		try {
			body = await request.json()
		} catch {
			return new Response(JSON.stringify({ message: 'Invalid request body', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate required fields
		if (!body.name) {
			return new Response(JSON.stringify({ message: 'name is required', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		if (!body.event_type) {
			return new Response(JSON.stringify({ message: 'event_type is required', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		if (!body.trigger_type) {
			return new Response(JSON.stringify({ message: 'trigger_type is required', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		if (!body.actions || body.actions.length === 0) {
			return new Response(JSON.stringify({ message: 'actions are required', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Validate name length
		if (body.name.length > AutoModLimits.MAX_NAME_LENGTH) {
			return new Response(
				JSON.stringify({ message: `Rule name cannot exceed ${AutoModLimits.MAX_NAME_LENGTH} characters`, code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Validate trigger metadata limits
		if (body.trigger_metadata) {
			if (body.trigger_metadata.keyword_filter && body.trigger_metadata.keyword_filter.length > AutoModLimits.MAX_KEYWORD_FILTER) {
				return new Response(
					JSON.stringify({ message: `keyword_filter cannot exceed ${AutoModLimits.MAX_KEYWORD_FILTER} entries`, code: 50035 }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}

			if (body.trigger_metadata.regex_patterns && body.trigger_metadata.regex_patterns.length > AutoModLimits.MAX_REGEX_PATTERNS) {
				return new Response(
					JSON.stringify({ message: `regex_patterns cannot exceed ${AutoModLimits.MAX_REGEX_PATTERNS} entries`, code: 50035 }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}

			if (body.trigger_metadata.allow_list && body.trigger_metadata.allow_list.length > AutoModLimits.MAX_ALLOW_LIST_KEYWORD) {
				return new Response(
					JSON.stringify({ message: `allow_list cannot exceed ${AutoModLimits.MAX_ALLOW_LIST_KEYWORD} entries`, code: 50035 }),
					{
						status: 400,
						headers: { 'Content-Type': 'application/json' }
					}
				)
			}

			if (body.trigger_metadata.mention_total_limit !== undefined) {
				if (body.trigger_metadata.mention_total_limit > AutoModLimits.MAX_MENTION_TOTAL_LIMIT) {
					return new Response(
						JSON.stringify({ message: `mention_total_limit cannot exceed ${AutoModLimits.MAX_MENTION_TOTAL_LIMIT}`, code: 50035 }),
						{
							status: 400,
							headers: { 'Content-Type': 'application/json' }
						}
					)
				}
			}
		}

		// Validate exempt limits
		if (body.exempt_roles && body.exempt_roles.length > AutoModLimits.MAX_EXEMPT_ROLES) {
			return new Response(
				JSON.stringify({ message: `exempt_roles cannot exceed ${AutoModLimits.MAX_EXEMPT_ROLES} entries`, code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		if (body.exempt_channels && body.exempt_channels.length > AutoModLimits.MAX_EXEMPT_CHANNELS) {
			return new Response(
				JSON.stringify({ message: `exempt_channels cannot exceed ${AutoModLimits.MAX_EXEMPT_CHANNELS} entries`, code: 50035 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Check rule limit per guild (6 per trigger type, so 6 * 5 = 30 total max)
		const existingRules = session.state.getGuildAutoModRules(guildId)
		const maxTotalRules = AutoModLimits.MAX_RULES_PER_TRIGGER_TYPE * 5 // 5 trigger types
		if (existingRules.length >= maxTotalRules) {
			return new Response(
				JSON.stringify({ message: `Guild has reached maximum rule limit of ${maxTotalRules}`, code: 30042 }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		}

		// Create the auto moderation rule
		const rule = session.state.createAutoModRule(
			guildId,
			{
				name: body.name,
				eventType: body.event_type,
				triggerType: body.trigger_type,
				triggerMetadata: body.trigger_metadata ? {
					keywordFilter: body.trigger_metadata.keyword_filter,
					regexPatterns: body.trigger_metadata.regex_patterns,
					presets: body.trigger_metadata.presets,
					allowList: body.trigger_metadata.allow_list,
					mentionTotalLimit: body.trigger_metadata.mention_total_limit,
					mentionRaidProtectionEnabled: body.trigger_metadata.mention_raid_protection_enabled
				} : undefined,
				actions: body.actions.map((action) => ({
					type: action.type,
					metadata: action.metadata ? {
						channelId: action.metadata.channel_id,
						durationSeconds: action.metadata.duration_seconds,
						customMessage: action.metadata.custom_message
					} : undefined
				})),
				enabled: body.enabled ?? true,
				exemptRoles: body.exempt_roles ?? [],
				exemptChannels: body.exempt_channels ?? []
			},
			session.state.botUser.id
		)

		if (!rule) {
			return new Response(JSON.stringify({ message: 'Failed to create auto moderation rule', code: 50035 }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			})
		}

		// Record action
		session.recordAction(
			'automod_rule_created',
			{
				rule_id: rule.id,
				guild_id: guildId,
				name: rule.name,
				trigger_type: rule.triggerType
			},
			{
				endpoint: `POST /guilds/${guildId}/auto-moderation/rules`,
				method: 'POST'
			}
		)

		// Dispatch AUTO_MODERATION_RULE_CREATE event
		await session.dispatchAutoModerationRuleCreate(rule)

		return new Response(JSON.stringify(mockAutoModRuleToAPIAutoModRule(rule)), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		})
	}
)
