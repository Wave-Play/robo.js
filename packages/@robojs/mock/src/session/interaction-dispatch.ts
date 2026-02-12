/**
 * Shared interaction dispatch handler
 *
 * This module provides a reusable function for dispatching interactions to sessions.
 * Used by both the plugin route and standalone server to avoid code duplication.
 */
import { generateSnowflake } from '../utils/snowflake.js'
import type { Session, ActionMetadata } from '../types/index.js'

/**
 * Input for dispatching an interaction
 */
export interface DispatchInteractionInput {
	type: number
	data?: {
		name?: string
		type?: number
		custom_id?: string
		values?: string[]
		options?: Array<{ name: string; type: number; value: unknown }>
	}
	guild_id?: string
	channel_id?: string
	user?: {
		id?: string
		username?: string
	}
	/** Optional metadata for simulation tracing */
	metadata?: ActionMetadata
}

/**
 * Result of dispatching an interaction
 */
export interface DispatchInteractionResult {
	success: true
	interaction_id: string
	interaction_token: string
}

/**
 * Dispatch an interaction to a session
 *
 * This is the core logic for the /api/control/sessions/:id/interaction endpoint.
 * It generates IDs, creates the interaction in state, and dispatches INTERACTION_CREATE.
 */
export async function dispatchInteractionToSession(
	session: Session,
	input: DispatchInteractionInput
): Promise<DispatchInteractionResult> {
	// Generate interaction ID and token
	const interactionId = generateSnowflake()
	const interactionToken = `mock-interaction-${generateSnowflake()}`

	// Get default guild and channel
	const defaultGuildId = input.guild_id || session.state.guilds.values().next().value?.id || ''
	const defaultChannelId = input.channel_id || session.state.channels.values().next().value?.id || ''

	// Get channel info from state for the channel object (Discord API spec)
	const channel = session.state.channels.get(defaultChannelId)

	// Get or create user - use currentUser as default
	const currentUser = session.state.currentUser
	const userId = input.user?.id || currentUser.id
	const username = input.user?.username || currentUser.username

	// Ensure user exists in state
	if (!session.state.users.has(userId)) {
		session.state.users.set(userId, {
			id: userId,
			username,
			discriminator: '0',
			globalName: username,
			avatar: null,
			bot: false
		})
	}

	// Create interaction in state
	session.state.addInteraction({
		id: interactionId,
		applicationId: session.state.applicationId,
		type: input.type,
		token: interactionToken,
		channelId: defaultChannelId,
		guildId: defaultGuildId,
		userId,
		commandName: input.data?.name,
		customId: input.data?.custom_id,
		values: input.data?.values,
		createdAt: Date.now(),
		expiresAt: Date.now() + 15 * 60 * 1000 // 15 minutes
	})

	// Build full interaction payload
	const interactionPayload = {
		id: interactionId,
		application_id: session.state.applicationId,
		type: input.type,
		token: interactionToken,
		version: 1,
		data: input.data || {},
		guild_id: defaultGuildId,
		channel_id: defaultChannelId, // Deprecated but kept for backwards compatibility
		channel: {
			id: defaultChannelId,
			type: channel?.type ?? 0, // Default to GUILD_TEXT
			name: channel?.name,
			guild_id: defaultGuildId,
			permissions: '562949953421311' // Full permissions
		},
		member: defaultGuildId
			? {
					user: {
						id: userId,
						username,
						discriminator: '0',
						global_name: username,
						avatar: null,
						bot: false
					},
					roles: [],
					joined_at: new Date().toISOString(),
					deaf: false,
					mute: false
			  }
			: undefined,
		user: !defaultGuildId
			? {
					id: userId,
					username,
					discriminator: '0',
					global_name: username,
					avatar: null,
					bot: false
			  }
			: undefined,
		entitlements: [],
		app_permissions: '0',
		locale: 'en-US',
		guild_locale: 'en-US'
	}

	// Set up action context for metadata propagation
	if (input.metadata) {
		const context = { metadata: input.metadata }
		session.setActionContext(context)

		// Ad-hoc interaction context should not leak indefinitely. Clear after a short timeout
		// if it hasn't been replaced by a new dispatch.
		const timeout = setTimeout(() => {
			if (session.getActionContext() === context) {
				session.clearActionContext()
			}
		}, 5000)
		timeout.unref?.()
	} else {
		// Clear any existing context to prevent stale metadata from leaking
		session.clearActionContext()
	}

	// Dispatch the interaction
	await session.dispatch('INTERACTION_CREATE', interactionPayload)

	return {
		success: true,
		interaction_id: interactionId,
		interaction_token: interactionToken
	}
}
