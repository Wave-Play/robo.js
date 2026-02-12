import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../../../core/manager.js'
import { parseMockToken } from '../../../../../../utils/id.js'
import { mockAutoModRuleToAPIAutoModRule } from '../../../../../../discord/payloads.js'
import { AutoModLimits } from '../../../../../../types/index.js'
import { enforcePermissions } from '../../../../../../utils/permission-check.js'

/**
 * GET /api/v10/guilds/:id/auto-moderation/rules/:ruleId - Get an auto moderation rule
 * PATCH /api/v10/guilds/:id/auto-moderation/rules/:ruleId - Modify an auto moderation rule
 * DELETE /api/v10/guilds/:id/auto-moderation/rules/:ruleId - Delete an auto moderation rule
 *
 * @see https://discord.com/developers/docs/resources/auto-moderation#get-auto-moderation-rule
 * @see https://discord.com/developers/docs/resources/auto-moderation#modify-auto-moderation-rule
 * @see https://discord.com/developers/docs/resources/auto-moderation#delete-auto-moderation-rule
 */
function resolveAutoModRule(request: RoboRequest) {
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

	// 2. Extract guild ID and rule ID from params
	const { id: guildId, ruleId } = request.params as { id: string; ruleId: string }

	// 3. Validate guild exists
	const guild = session.state.guilds.get(guildId)
	if (!guild) {
		return new Response(JSON.stringify({ message: 'Unknown Guild', code: 10004 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// 4. Get the auto moderation rule
	const rule = session.state.getAutoModRule(guildId, ruleId)
	if (!rule) {
		return new Response(JSON.stringify({ message: 'Unknown Auto Moderation Rule', code: 10132 }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	return { session, guild, guildId, rule, ruleId }
}

export async function GET(request: RoboRequest) {
	const resolved = resolveAutoModRule(request)
	if (resolved instanceof Response) return resolved
	const { session, guildId, rule, ruleId } = resolved

	// Check permissions (MANAGE_GUILD required)
	const permError = enforcePermissions(session, 'GET', `/guilds/${guildId}/auto-moderation/rules/${ruleId}`, undefined, guildId)
	if (permError) return permError

	return mockAutoModRuleToAPIAutoModRule(rule)
}

export async function PATCH(request: RoboRequest) {
	const resolved = resolveAutoModRule(request)
	if (resolved instanceof Response) return resolved
	const { session, guildId, ruleId } = resolved

	// Check permissions (MANAGE_GUILD required)
	const permError = enforcePermissions(session, 'PATCH', `/guilds/${guildId}/auto-moderation/rules/${ruleId}`, undefined, guildId)
	if (permError) return permError

	// Parse request body
	let body: {
		name?: string
		event_type?: number
		trigger_metadata?: {
			keyword_filter?: string[]
			regex_patterns?: string[]
			presets?: number[]
			allow_list?: string[]
			mention_total_limit?: number
			mention_raid_protection_enabled?: boolean
		}
		actions?: Array<{
			type: number
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

	// Validate name length if provided
	if (body.name !== undefined && body.name.length > AutoModLimits.MAX_NAME_LENGTH) {
		return new Response(
			JSON.stringify({ message: `Rule name cannot exceed ${AutoModLimits.MAX_NAME_LENGTH} characters`, code: 50035 }),
			{
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			}
		)
	}

	// Validate trigger metadata limits if provided
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

	// Validate exempt limits if provided
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

	// Update the auto moderation rule
	const updatedRule = session.state.updateAutoModRule(guildId, ruleId, {
		name: body.name,
		eventType: body.event_type,
		triggerMetadata: body.trigger_metadata ? {
			keywordFilter: body.trigger_metadata.keyword_filter,
			regexPatterns: body.trigger_metadata.regex_patterns,
			presets: body.trigger_metadata.presets,
			allowList: body.trigger_metadata.allow_list,
			mentionTotalLimit: body.trigger_metadata.mention_total_limit,
			mentionRaidProtectionEnabled: body.trigger_metadata.mention_raid_protection_enabled
		} : undefined,
		actions: body.actions?.map((action) => ({
			type: action.type,
			metadata: action.metadata ? {
				channelId: action.metadata.channel_id,
				durationSeconds: action.metadata.duration_seconds,
				customMessage: action.metadata.custom_message
			} : undefined
		})),
		enabled: body.enabled,
		exemptRoles: body.exempt_roles,
		exemptChannels: body.exempt_channels
	})

	if (!updatedRule) {
		return new Response(JSON.stringify({ message: 'Failed to update auto moderation rule', code: 50035 }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		})
	}

	// Record action
	session.recordAction(
		'automod_rule_updated',
		{
			rule_id: ruleId,
			guild_id: guildId,
			changes: body
		},
		{
			endpoint: `PATCH /guilds/${guildId}/auto-moderation/rules/${ruleId}`,
			method: 'PATCH'
		}
	)

	// Dispatch AUTO_MODERATION_RULE_UPDATE event
	await session.dispatchAutoModerationRuleUpdate(updatedRule)

	return new Response(JSON.stringify(mockAutoModRuleToAPIAutoModRule(updatedRule)), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	})
}

export async function DELETE(request: RoboRequest) {
	const resolved = resolveAutoModRule(request)
	if (resolved instanceof Response) return resolved
	const { session, guildId, rule, ruleId } = resolved

	// Check permissions (MANAGE_GUILD required)
	const permError = enforcePermissions(session, 'DELETE', `/guilds/${guildId}/auto-moderation/rules/${ruleId}`, undefined, guildId)
	if (permError) return permError

	// Delete the auto moderation rule
	session.state.deleteAutoModRule(guildId, ruleId)

	// Record action
	session.recordAction(
		'automod_rule_deleted',
		{
			rule_id: ruleId,
			guild_id: guildId
		},
		{
			endpoint: `DELETE /guilds/${guildId}/auto-moderation/rules/${ruleId}`,
			method: 'DELETE'
		}
	)

	// Dispatch AUTO_MODERATION_RULE_DELETE event
	await session.dispatchAutoModerationRuleDelete(rule)

	return new Response(null, { status: 204 })
}
