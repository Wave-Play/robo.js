import type { RoboRequest } from '@robojs/server'
import { sessionManager } from '../../../../core/manager.js'
import { getStageServer } from '../../../../core/stage.js'
import { VOICE_GATEWAY_PORT } from '../../../../core/voice-gateway.js'
import { validateMethod, notFound, badRequest } from '../../utils.js'
import { createMockGuild, createMockChannel } from '../../../../session/state.js'
import { generateSnowflake } from '../../../../utils/snowflake.js'
import type { VoiceServerState, MockAttachment } from '../../../../types/index.js'

/**
 * POST /api/control/sessions/:id/dispatch - Dispatch an event to session connections
 *
 * Request body:
 * {
 *   event: string          // Event name (e.g., "MESSAGE_CREATE", "INTERACTION_CREATE")
 *   data: {                // Event-specific data
 *     // For MESSAGE_CREATE:
 *     channel_id: string   // Required for MESSAGE_CREATE
 *     content?: string     // Message content
 *     author?: {           // Optional author info
 *       id?: string
 *       username?: string
 *       bot?: boolean
 *     }
 *     embeds?: unknown[]
 *     attachments?: unknown[]
 *
 *     // For INTERACTION_CREATE (slash commands):
 *     command_name: string // Required for INTERACTION_CREATE
 *     options?: Record<string, string | number | boolean>
 *     user?: { id?: string, username?: string, bot?: boolean }
 *     channel_id?: string
 *     guild_id?: string
 *
 *     // For MESSAGE_POLL_VOTE_ADD / MESSAGE_POLL_VOTE_REMOVE (Phase 4G):
 *     user_id: string      // Required - user who voted
 *     message_id: string   // Required - message with poll
 *     answer_id: number    // Required - poll answer ID (1-indexed)
 *   }
 * }
 *
 * Response:
 * {
 *   success: true,
 *   dispatched: number,       // Number of connections event was sent to
 *   message_id?: string       // For MESSAGE_CREATE, the generated message ID
 *   interaction_id?: string   // For INTERACTION_CREATE, the generated interaction ID
 *   interaction_token?: string // For INTERACTION_CREATE, the interaction token
 * }
 */
export default async (request: RoboRequest) => {
	validateMethod(request, ['POST'])

	const { id } = request.params as { id: string }

	if (!id) {
		return notFound('Session ID required')
	}

	const session = sessionManager.get(id)

	if (!session) {
		return notFound('Session not found')
	}

	// Parse request body
	let body: {
		event: string
		data: Record<string, unknown>
	}

	try {
		body = await request.json()
	} catch {
		return badRequest('Invalid JSON body')
	}

	// Validate required fields
	if (!body.event || typeof body.event !== 'string') {
		return badRequest('Missing or invalid "event" field')
	}

	if (!body.data || typeof body.data !== 'object') {
		return badRequest('Missing or invalid "data" field')
	}

	// Handle MESSAGE_CREATE specially
	if (body.event === 'MESSAGE_CREATE') {
		const data = body.data as {
			id?: string
			channel_id?: string
			content?: string
			author?: {
				id?: string
				username?: string
				bot?: boolean
			}
			embeds?: unknown[]
			attachments?: unknown[]
			components?: unknown[]
			mentions?: Array<{ id?: string; username?: string; discriminator?: string; avatar?: string | null; bot?: boolean; global_name?: string | null }>
			mention_roles?: string[]
			mention_everyone?: boolean
			mention_channels?: Array<{ id: string; name: string; type: number; guild_id: string }>
			reactions?: Array<{
				emoji: { id: string | null; name: string }
				count: number
				me: boolean
			}>
			/** Message type (0 = DEFAULT, 7 = USER_JOIN, 8 = GUILD_BOOST, etc.) */
			type?: number
			/** Call info for DM call messages */
			call?: {
				participants: string[]
				ended_timestamp?: string | null
			}
			/** Role subscription data for subscription purchase messages */
			role_subscription_data?: {
				role_subscription_listing_id?: string
				tier_name?: string
				total_months_subscribed?: number
				is_renewal?: boolean
			}
			/** Message position (for threads/forums) */
			position?: number
		}

		if (!data.channel_id) {
			return badRequest('MESSAGE_CREATE requires "channel_id" in data')
		}

		// Check if this is a raw dispatch with full mention data
		// If full mentions array is provided (with username, not just id), dispatch raw data
		const hasFullMentionData = data.mentions?.some((m) => m.username !== undefined)
		const hasRoleMentions = data.mention_roles && data.mention_roles.length > 0

		if (hasFullMentionData || hasRoleMentions) {
			// Dispatch raw MESSAGE_CREATE payload to preserve full mention data
			// This allows tests to send full Discord API format payloads directly
			await session.dispatch(body.event, body.data)

			return {
				success: true,
				dispatched: session.connections.size,
				message_id: data.id ?? 'unknown'
			}
		}

		// Extract mention user IDs from the mentions array
		const mentionIds = data.mentions?.map((m) => m.id).filter((id): id is string => !!id) ?? []

		try {
			const message = await session.dispatchMessage({
				id: data.id,
				channelId: data.channel_id,
				content: data.content,
				author: data.author,
				embeds: data.embeds,
				attachments: data.attachments as MockAttachment[] | undefined,
				components: data.components,
				mentions: mentionIds,
				reactions: data.reactions,
				type: data.type,
				call: data.call,
				roleSubscriptionData: data.role_subscription_data ? {
					roleSubscriptionListingId: data.role_subscription_data.role_subscription_listing_id ?? '',
					tierName: data.role_subscription_data.tier_name ?? '',
					totalMonthsSubscribed: data.role_subscription_data.total_months_subscribed ?? 0,
					isRenewal: data.role_subscription_data.is_renewal ?? false
				} : undefined,
				position: data.position
			})

			return {
				success: true,
				dispatched: session.connections.size,
				message_id: message.id
			}
		} catch (error) {
			return badRequest((error as Error).message)
		}
	}

	// Handle MESSAGE_POLL_VOTE_ADD and MESSAGE_POLL_VOTE_REMOVE (Phase 4G)
	if (body.event === 'MESSAGE_POLL_VOTE_ADD' || body.event === 'MESSAGE_POLL_VOTE_REMOVE') {
		const data = body.data as {
			user_id?: string
			message_id?: string
			answer_id?: number
		}

		if (!data.user_id) {
			return badRequest(`${body.event} requires "user_id" in data`)
		}
		if (!data.message_id) {
			return badRequest(`${body.event} requires "message_id" in data`)
		}
		if (data.answer_id === undefined) {
			return badRequest(`${body.event} requires "answer_id" in data`)
		}

		try {
			const success = await session.dispatchPollVote({
				userId: data.user_id,
				messageId: data.message_id,
				answerId: data.answer_id,
				action: body.event === 'MESSAGE_POLL_VOTE_ADD' ? 'add' : 'remove'
			})

			return {
				success,
				dispatched: session.connections.size,
				message_id: data.message_id,
				user_id: data.user_id,
				answer_id: data.answer_id
			}
		} catch (error) {
			return badRequest((error as Error).message)
		}
	}

	// Handle INTERACTION_CREATE specially for slash commands, button clicks, select menus, and autocomplete
	if (body.event === 'INTERACTION_CREATE') {
		const data = body.data as {
			// Raw INTERACTION_CREATE payload fields (Phase 7)
			id?: string
			type?: number
			application_id?: string
			token?: string
			data?: unknown
			member?: unknown
			message?: unknown
			// Slash command fields
			command_name?: string
			options?: Record<string, string | number | boolean>
			// Autocomplete fields (Phase 3F)
			focused_option?: {
				name: string
				value: string
				type?: number
			}
			// Button click fields (Phase 3C)
			custom_id?: string
			message_id?: string
			// Select menu fields (Phase 3D)
			values?: string[]
			component_type?: number
			// Context menu fields (Phase 3G)
			target_id?: string
			context_menu_type?: 2 | 3
			// Common fields (structured format)
			user?: {
				id?: string
				username?: string
				bot?: boolean
			}
			channel_id?: string
			guild_id?: string
		}

		// Phase 7: Handle raw INTERACTION_CREATE payload (from integration tests)
		// Raw payloads have: id, type, application_id, token, data (not command_name at root level)
		if (data.id && data.type !== undefined && data.application_id && data.token) {
			// This is a raw Discord-format INTERACTION_CREATE payload
			// Store the interaction in state so callback endpoint can find it
			const interactionData = data.data as { name?: string; custom_id?: string; values?: string[] } | undefined
			const member = data.member as { user?: { id?: string } } | undefined
			const userId = member?.user?.id || data.user?.id || session.state.currentUser.id
			const channelId = data.channel_id || session.state.channels.values().next().value?.id || ''

			// Create interaction in state
			session.state.addInteraction({
				id: data.id,
				applicationId: data.application_id,
				type: data.type,
				token: data.token,
				channelId,
				guildId: data.guild_id,
				userId,
				commandName: interactionData?.name,
				customId: interactionData?.custom_id,
				values: interactionData?.values,
				messageId: (data.message as { id?: string })?.id,
				createdAt: Date.now(),
				expiresAt: Date.now() + 15 * 60 * 1000 // 15 minutes
			})

			// Get channel info from state for the channel object (Discord API spec)
			const channel = session.state.channels.get(channelId)

			// Ensure required fields are present for discord.js compatibility
			const rawPayload = body.data as Record<string, unknown>
			const enrichedPayload = {
				...rawPayload,
				// Discord.js requires entitlements array (even if empty)
				entitlements: rawPayload.entitlements ?? [],
				// Ensure app_permissions is present
				app_permissions: rawPayload.app_permissions ?? '562949953421311',
				// Ensure locale fields are present
				locale: rawPayload.locale ?? 'en-US',
				guild_locale: rawPayload.guild_locale ?? 'en-US',
				// Add channel object if not present (Discord API spec)
				channel: rawPayload.channel ?? {
					id: channelId,
					type: channel?.type ?? 0,
					name: channel?.name,
					guild_id: data.guild_id,
					permissions: '562949953421311'
				}
			}

			// Dispatch the enriched payload to gateway
			await session.dispatch(body.event, enrichedPayload)

			return {
				success: true,
				dispatched: session.connections.size,
				interaction_id: data.id,
				interaction_token: data.token
			}
		}

		// Select menu interaction (Phase 3D) - check BEFORE button since both have custom_id
		// Select menus have values array, buttons don't
		if (data.custom_id && data.values !== undefined) {
			if (!data.message_id) {
				return badRequest('Select menu interaction requires "message_id" in data')
			}

			try {
				const interaction = await session.dispatchSelectMenu({
					customId: data.custom_id,
					messageId: data.message_id,
					values: data.values,
					componentType: data.component_type,
					user: data.user,
					channelId: data.channel_id,
					guildId: data.guild_id
				})

				return {
					success: true,
					dispatched: session.connections.size,
					interaction_id: interaction.id,
					interaction_token: interaction.token,
					custom_id: interaction.customId,
					message_id: interaction.messageId,
					values: interaction.values,
					component_type: interaction.componentType,
					channel_id: interaction.channelId,
					guild_id: interaction.guildId
				}
			} catch (error) {
				return badRequest((error as Error).message)
			}
		}

		// Button click interaction (Phase 3C)
		if (data.custom_id) {
			if (!data.message_id) {
				return badRequest('Button click requires "message_id" in data')
			}

			try {
				const interaction = await session.dispatchButtonClick({
					customId: data.custom_id,
					messageId: data.message_id,
					user: data.user,
					channelId: data.channel_id,
					guildId: data.guild_id
				})

				return {
					success: true,
					dispatched: session.connections.size,
					interaction_id: interaction.id,
					interaction_token: interaction.token,
					custom_id: interaction.customId,
					message_id: interaction.messageId,
					channel_id: interaction.channelId,
					guild_id: interaction.guildId
				}
			} catch (error) {
				return badRequest((error as Error).message)
			}
		}

		// Context menu interaction (Phase 3G)
		// Context menus have target_id + context_menu_type
		if (data.target_id && data.context_menu_type) {
			if (!data.command_name) {
				return badRequest('Context menu interaction requires "command_name" in data')
			}

			if (data.context_menu_type !== 2 && data.context_menu_type !== 3) {
				return badRequest('context_menu_type must be 2 (USER) or 3 (MESSAGE)')
			}

			try {
				const interaction = await session.dispatchContextMenu({
					commandName: data.command_name,
					targetId: data.target_id,
					contextMenuType: data.context_menu_type,
					user: data.user,
					channelId: data.channel_id,
					guildId: data.guild_id
				})

				return {
					success: true,
					dispatched: session.connections.size,
					interaction_id: interaction.id,
					interaction_token: interaction.token,
					command_name: interaction.commandName,
					target_id: interaction.targetId,
					context_menu_type: interaction.contextMenuType,
					channel_id: interaction.channelId,
					guild_id: interaction.guildId
				}
			} catch (error) {
				return badRequest((error as Error).message)
			}
		}

		// Autocomplete interaction (Phase 3F)
		// Autocomplete has command_name + focused_option (not custom_id)
		if (data.command_name && data.focused_option) {
			const focusedOption = data.focused_option

			if (!focusedOption.name || focusedOption.value === undefined) {
				return badRequest('Autocomplete requires "focused_option" with "name" and "value"')
			}

			try {
				const interaction = await session.dispatchAutocomplete({
					commandName: data.command_name,
					focusedOption,
					options: data.options,
					user: data.user,
					channelId: data.channel_id,
					guildId: data.guild_id
				})

				return {
					success: true,
					dispatched: session.connections.size,
					interaction_id: interaction.id,
					interaction_token: interaction.token,
					command_name: interaction.commandName,
					focused_option: focusedOption.name,
					channel_id: interaction.channelId,
					guild_id: interaction.guildId
				}
			} catch (error) {
				return badRequest((error as Error).message)
			}
		}

		// Slash command interaction
		if (!data.command_name) {
			return badRequest('INTERACTION_CREATE requires "command_name", "custom_id", "focused_option", or "target_id" with "context_menu_type" in data')
		}

		try {
			const interaction = await session.dispatchSlashCommand({
				commandName: data.command_name,
				options: data.options,
				user: data.user,
				channelId: data.channel_id,
				guildId: data.guild_id
			})

			return {
				success: true,
				dispatched: session.connections.size,
				interaction_id: interaction.id,
				interaction_token: interaction.token,
				command_name: interaction.commandName,
				channel_id: interaction.channelId,
				guild_id: interaction.guildId
			}
		} catch (error) {
			return badRequest((error as Error).message)
		}
	}

	// Handle THREAD_CREATE (Phase 4D)
	if (body.event === 'THREAD_CREATE') {
		const data = body.data as {
			name: string
			parent_channel_id: string
			type?: 10 | 11 | 12
			auto_archive_duration?: 60 | 1440 | 4320 | 10080
			invitable?: boolean
			user?: {
				id?: string
				username?: string
				bot?: boolean
			}
		}

		if (!data.name || !data.parent_channel_id) {
			return badRequest('THREAD_CREATE requires "name" and "parent_channel_id" in data')
		}

		try {
			const thread = await session.dispatchThreadCreate({
				name: data.name,
				parentChannelId: data.parent_channel_id,
				type: data.type,
				autoArchiveDuration: data.auto_archive_duration,
				invitable: data.invitable,
				user: data.user
			})

			return {
				success: true,
				dispatched: session.connections.size,
				thread_id: thread.id,
				parent_id: thread.parentId,
				type: thread.type,
				name: thread.name
			}
		} catch (error) {
			return badRequest((error as Error).message)
		}
	}

	// Handle THREAD_UPDATE (Phase 4D)
	if (body.event === 'THREAD_UPDATE') {
		const data = body.data as {
			thread_id: string
			name?: string
			archived?: boolean
			locked?: boolean
			auto_archive_duration?: 60 | 1440 | 4320 | 10080
			invitable?: boolean
		}

		if (!data.thread_id) {
			return badRequest('THREAD_UPDATE requires "thread_id" in data')
		}

		try {
			const thread = await session.dispatchThreadUpdate(data.thread_id, {
				name: data.name,
				archived: data.archived,
				locked: data.locked,
				autoArchiveDuration: data.auto_archive_duration,
				invitable: data.invitable
			})

			return {
				success: true,
				dispatched: session.connections.size,
				thread_id: thread.id,
				name: thread.name,
				archived: thread.threadMetadata.archived,
				locked: thread.threadMetadata.locked
			}
		} catch (error) {
			return badRequest((error as Error).message)
		}
	}

	// Handle THREAD_DELETE (Phase 4D)
	if (body.event === 'THREAD_DELETE') {
		const data = body.data as {
			thread_id: string
		}

		if (!data.thread_id) {
			return badRequest('THREAD_DELETE requires "thread_id" in data')
		}

		try {
			await session.dispatchThreadDelete(data.thread_id)

			return {
				success: true,
				dispatched: session.connections.size,
				thread_id: data.thread_id
			}
		} catch (error) {
			return badRequest((error as Error).message)
		}
	}

	// Handle THREAD_MEMBER_UPDATE (join/leave) (Phase 4D)
	if (body.event === 'THREAD_MEMBER_UPDATE') {
		const data = body.data as {
			thread_id: string
			action: 'join' | 'leave'
			user_id?: string
		}

		if (!data.thread_id || !data.action) {
			return badRequest('THREAD_MEMBER_UPDATE requires "thread_id" and "action" in data')
		}

		try {
			if (data.action === 'join') {
				if (data.user_id) {
					await session.dispatchThreadMemberAdd(data.thread_id, data.user_id)
				} else {
					await session.dispatchThreadJoin(data.thread_id)
				}
			} else {
				if (data.user_id) {
					await session.dispatchThreadMemberRemove(data.thread_id, data.user_id)
				} else {
					await session.dispatchThreadLeave(data.thread_id)
				}
			}

			return {
				success: true,
				dispatched: session.connections.size,
				thread_id: data.thread_id,
				action: data.action,
				user_id: data.user_id ?? session.state.botUser.id
			}
		} catch (error) {
			return badRequest((error as Error).message)
		}
	}

	// Handle THREAD_LIST_SYNC (Phase 4D)
	if (body.event === 'THREAD_LIST_SYNC') {
		const data = body.data as {
			guild_id: string
			channel_ids?: string[]
		}

		if (!data.guild_id) {
			return badRequest('THREAD_LIST_SYNC requires "guild_id" in data')
		}

		try {
			await session.dispatchThreadListSync(data.guild_id, data.channel_ids)

			return {
				success: true,
				dispatched: session.connections.size,
				guild_id: data.guild_id
			}
		} catch (error) {
			return badRequest((error as Error).message)
		}
	}

	// Handle GUILD_MEMBER_ADD - create member in state AND dispatch event
	if (body.event === 'GUILD_MEMBER_ADD') {
		const data = body.data as {
			guild_id?: string
			user?: {
				id?: string
				username?: string
				discriminator?: string
				global_name?: string | null
				bot?: boolean
			}
			roles?: string[]
			joined_at?: string
			premium_since?: string | null
			deaf?: boolean
			mute?: boolean
			nick?: string | null
		}

		if (!data.guild_id || !data.user?.id) {
			return badRequest('GUILD_MEMBER_ADD requires "guild_id" and "user.id" in data')
		}

		// Create user in state if not exists
		if (!session.state.users.has(data.user.id)) {
			session.state.users.set(data.user.id, {
				id: data.user.id,
				username: data.user.username ?? 'User',
				discriminator: data.user.discriminator ?? '0',
				globalName: data.user.global_name ?? null,
				avatar: null,
				bot: data.user.bot ?? false
			})
		}

		// Create guild member in state
		const memberKey = `${data.guild_id}:${data.user.id}`
		if (!session.state.guildMembers.has(memberKey)) {
			session.state.guildMembers.set(memberKey, {
				userId: data.user.id,
				guildId: data.guild_id,
				roles: data.roles ?? [],
				nick: data.nick ?? null,
				joinedAt: data.joined_at ?? new Date().toISOString(),
				premiumSince: data.premium_since ?? null,
				deaf: data.deaf ?? false,
				mute: data.mute ?? false,
				pending: false,
				communicationDisabledUntil: null,
				flags: 0
			})
		}

		// Add user to guild members list
		const guild = session.state.guilds.get(data.guild_id)
		if (guild && !guild.members.includes(data.user.id)) {
			guild.members.push(data.user.id)
		}

		// Dispatch the event
		await session.dispatch(body.event, body.data)

		// Notify stage clients of the update
		getStageServer().broadcastStateRefresh(id)

		return {
			success: true,
			dispatched: session.connections.size,
			user_id: data.user.id,
			guild_id: data.guild_id
		}
	}

	// Handle GUILD_CREATE - create guild and channels in state
	if (body.event === 'GUILD_CREATE') {
		const data = body.data as {
			id: string
			name: string
			icon?: string | null
			owner_id?: string
			member_count?: number
			channels?: Array<{
				id: string
				type: number
				name: string
				position?: number
				guild_id?: string
				parent_id?: string | null
				topic?: string | null
			}>
			roles?: Array<{
				id: string
				name: string
				color?: number
				position?: number
				hoist?: boolean
				permissions?: string
			}>
			members?: Array<{
				user: {
					id: string
					username: string
					discriminator?: string
					avatar?: string | null
					bot?: boolean
				}
				roles?: string[]
				joined_at?: string
			}>
		}

		if (!data.id || !data.name) {
			return badRequest('GUILD_CREATE requires "id" and "name" in data')
		}

		// Create guild in state
		const guild = createMockGuild({
			id: data.id,
			name: data.name,
			ownerId: data.owner_id || session.state.botUser.id
		})
		session.state.addGuild(guild)

		// Create channels from data
		if (data.channels && data.channels.length > 0) {
			for (const channelData of data.channels) {
				const channel = createMockChannel({
					id: channelData.id,
					guildId: data.id,
					name: channelData.name,
					type: channelData.type,
					parentId: channelData.parent_id
				})
				session.state.addChannelToGuild(data.id, channel)
			}
		}

		// Create roles from data (Phase 5H)
		if (data.roles && data.roles.length > 0) {
			for (const roleData of data.roles) {
				session.state.roles.set(roleData.id, {
					id: roleData.id,
					guildId: data.id,
					name: roleData.name,
					color: roleData.color ?? 0,
					hoist: roleData.hoist ?? false,
					position: roleData.position ?? 0,
					permissions: roleData.permissions ?? '0',
					managed: false,
					mentionable: false,
					flags: 0
				})
			}
		}

		// Create members from data (Phase 5H)
		if (data.members && data.members.length > 0) {
			for (const memberData of data.members) {
				// Create or get user
				let user = session.state.users.get(memberData.user.id)
				if (!user) {
					user = {
						id: memberData.user.id,
						username: memberData.user.username,
						discriminator: memberData.user.discriminator ?? '0',
						globalName: null,
						avatar: memberData.user.avatar ?? null,
						bot: memberData.user.bot ?? false
					}
					session.state.users.set(user.id, user)
				}

				// Create guild member
				const memberKey = `${data.id}:${user.id}`
				session.state.guildMembers.set(memberKey, {
					userId: user.id,
					guildId: data.id,
					roles: memberData.roles ?? [],
					nick: null,
					joinedAt: memberData.joined_at ?? new Date().toISOString(),
					deaf: false,
					mute: false,
					pending: false,
					flags: 0
				})
			}
		}

		// Dispatch to gateway
		await session.dispatch(body.event, body.data)

		// Notify stage clients of the update via state_sync refresh
		getStageServer().broadcastStateRefresh(id)

		return {
			success: true,
			dispatched: session.connections.size,
			guild_id: data.id,
			channel_count: data.channels?.length ?? 0,
			role_count: data.roles?.length ?? 0,
			member_count: data.members?.length ?? 0
		}
	}

	// Handle GUILD_SCHEDULED_EVENT_USER_ADD - add subscriber to state AND dispatch event
	if (body.event === 'GUILD_SCHEDULED_EVENT_USER_ADD') {
		const data = body.data as {
			guild_scheduled_event_id: string
			user_id: string
			guild_id: string
		}

		if (!data.guild_scheduled_event_id || !data.user_id || !data.guild_id) {
			return badRequest('GUILD_SCHEDULED_EVENT_USER_ADD requires "guild_scheduled_event_id", "user_id", and "guild_id" in data')
		}

		// Add subscriber to state
		const added = session.state.addScheduledEventSubscriber(data.guild_id, data.guild_scheduled_event_id, data.user_id)
		if (!added) {
			return badRequest('Scheduled event not found')
		}

		// Create user in state if not exists
		if (!session.state.users.has(data.user_id)) {
			session.state.users.set(data.user_id, {
				id: data.user_id,
				username: `User_${data.user_id.slice(-4)}`,
				discriminator: '0',
				globalName: null,
				avatar: null,
				bot: false
			})
		}

		// Dispatch the event
		await session.dispatch(body.event, body.data)

		return {
			success: true,
			dispatched: session.connections.size,
			event_id: data.guild_scheduled_event_id,
			user_id: data.user_id
		}
	}

	// Handle GUILD_SCHEDULED_EVENT_USER_REMOVE - remove subscriber from state AND dispatch event
	if (body.event === 'GUILD_SCHEDULED_EVENT_USER_REMOVE') {
		const data = body.data as {
			guild_scheduled_event_id: string
			user_id: string
			guild_id: string
		}

		if (!data.guild_scheduled_event_id || !data.user_id || !data.guild_id) {
			return badRequest('GUILD_SCHEDULED_EVENT_USER_REMOVE requires "guild_scheduled_event_id", "user_id", and "guild_id" in data')
		}

		// Remove subscriber from state
		session.state.removeScheduledEventSubscriber(data.guild_id, data.guild_scheduled_event_id, data.user_id)

		// Dispatch the event
		await session.dispatch(body.event, body.data)

		return {
			success: true,
			dispatched: session.connections.size,
			event_id: data.guild_scheduled_event_id,
			user_id: data.user_id
		}
	}

	// Handle MESSAGE_REACTION_ADD - update state AND dispatch
	if (body.event === 'MESSAGE_REACTION_ADD') {
		const data = body.data as {
			message_id: string
			channel_id: string
			guild_id?: string
			user_id: string
			emoji: { id: string | null; name: string }
		}

		if (!data.message_id || !data.channel_id || !data.user_id || !data.emoji) {
			return badRequest('MESSAGE_REACTION_ADD requires "message_id", "channel_id", "user_id", and "emoji" in data')
		}

		// Add reaction to message state so fetch() returns complete data
		session.state.addReaction(data.message_id, data.user_id, data.emoji)

		// Dispatch the event
		await session.dispatch(body.event, body.data)

		return {
			success: true,
			dispatched: session.connections.size,
			message_id: data.message_id,
			emoji: data.emoji.name
		}
	}

	// Handle MESSAGE_REACTION_REMOVE - update state AND dispatch
	if (body.event === 'MESSAGE_REACTION_REMOVE') {
		const data = body.data as {
			message_id: string
			channel_id: string
			guild_id?: string
			user_id: string
			emoji: { id: string | null; name: string }
		}

		if (!data.message_id || !data.channel_id || !data.user_id || !data.emoji) {
			return badRequest('MESSAGE_REACTION_REMOVE requires "message_id", "channel_id", "user_id", and "emoji" in data')
		}

		// Remove reaction from message state
		session.state.removeReaction(data.message_id, data.user_id, data.emoji)

		// Dispatch the event
		await session.dispatch(body.event, body.data)

		return {
			success: true,
			dispatched: session.connections.size,
			message_id: data.message_id,
			emoji: data.emoji.name
		}
	}

	// Handle VOICE_STATE_UPDATE - update state AND broadcast to Stage clients (Phase 5P)
	// Also dispatch VOICE_SERVER_UPDATE when bot joins voice (Phase 27)
	if (body.event === 'VOICE_STATE_UPDATE') {
		const data = body.data as {
			guild_id: string
			channel_id: string | null
			user_id: string
			session_id?: string
			self_mute?: boolean
			self_deaf?: boolean
			mute?: boolean
			deaf?: boolean
			speaking?: boolean
			member?: {
				user: { id: string; username: string; discriminator?: string; avatar?: string | null }
				nick?: string | null
				roles?: string[]
				joined_at?: string
			}
		}

		if (!data.guild_id || !data.user_id) {
			return badRequest('VOICE_STATE_UPDATE requires "guild_id" and "user_id" in data')
		}

		// Generate session_id if not provided
		const voiceSessionId = data.session_id ?? generateSnowflake()

		// Update session state
		const voiceStateKey = `${data.guild_id}:${data.user_id}`
		const isBotUser = data.user_id === session.state.botUser.id
		const isJoiningVoice = data.channel_id !== null

		if (data.channel_id === null) {
			// User left voice - clean up voice server state if bot
			session.state.voiceStates.delete(voiceStateKey)
			if (isBotUser) {
				// Remove voice server state when bot leaves
				session.voiceServers.delete(data.guild_id)
			}
		} else {
			// User joined or updated voice state
			const existingState = session.state.voiceStates.get(voiceStateKey)
			session.state.voiceStates.set(voiceStateKey, {
				guild_id: data.guild_id,
				channel_id: data.channel_id,
				user_id: data.user_id,
				session_id: voiceSessionId,
				self_mute: data.self_mute ?? existingState?.self_mute ?? false,
				self_deaf: data.self_deaf ?? existingState?.self_deaf ?? false,
				mute: data.mute ?? existingState?.mute ?? false,
				deaf: data.deaf ?? existingState?.deaf ?? false
			})

			// Ensure user exists in state if member data provided
			if (data.member?.user && !session.state.users.has(data.member.user.id)) {
				session.state.users.set(data.member.user.id, {
					id: data.member.user.id,
					username: data.member.user.username,
					discriminator: data.member.user.discriminator ?? '0',
					globalName: null,
					avatar: data.member.user.avatar ?? null,
					bot: false
				})
			}
			if (data.member?.user) {
				session.state.createGuildMember(data.guild_id, data.member.user.id, {
					roles: data.member.roles ?? [],
					nick: data.member.nick ?? null
				})
				const storedMember = session.state.getGuildMember(data.guild_id, data.member.user.id)
				if (storedMember && data.member.joined_at) {
					storedMember.joinedAt = data.member.joined_at
				}
			}
		}

		// Dispatch VOICE_STATE_UPDATE to gateway
		const voiceStatePayload = {
			...body.data,
			session_id: voiceSessionId
		}
		await session.dispatch(body.event, voiceStatePayload)

		// If bot is joining voice, also dispatch VOICE_SERVER_UPDATE (Phase 27)
		if (isBotUser && isJoiningVoice) {
			// Generate voice server token and store state
			const voiceToken = `mock-voice-${generateSnowflake()}`
			const voiceServerState: VoiceServerState = {
				token: voiceToken,
				endpoint: `localhost:${VOICE_GATEWAY_PORT}`,
				sessionId: voiceSessionId,
				guildId: data.guild_id,
				channelId: data.channel_id!,
				userId: data.user_id,
				createdAt: Date.now()
			}

			// Store voice server state on session
			session.voiceServers.set(data.guild_id, voiceServerState)

			// Dispatch VOICE_SERVER_UPDATE after a small delay (Discord does this)
			setTimeout(async () => {
				await session.dispatch('VOICE_SERVER_UPDATE', {
					token: voiceToken,
					guild_id: data.guild_id,
					endpoint: `localhost:${VOICE_GATEWAY_PORT}`
				})
			}, 10)
		}

		const storedUser = session.state.getUser(data.user_id)
		const storedMember = session.state.getGuildMember(data.guild_id, data.user_id)
		const memberUser = data.member?.user
			? {
					id: data.member.user.id,
					username: data.member.user.username,
					global_name: undefined,
					discriminator: data.member.user.discriminator ?? '0',
					avatar: data.member.user.avatar ?? null,
					bot: false
				}
			: storedUser
				? {
						id: storedUser.id,
						username: storedUser.username,
						global_name: storedUser.globalName ?? undefined,
						discriminator: storedUser.discriminator ?? '0',
						avatar: storedUser.avatar ?? null,
						bot: storedUser.bot
					}
				: undefined
		const stageMember = memberUser
			? {
					user: {
						id: memberUser.id,
						username: memberUser.username,
						global_name: memberUser.global_name,
						discriminator: memberUser.discriminator ?? '0',
						avatar: memberUser.avatar ?? null,
						bot: memberUser.bot
					},
					nick: data.member?.nick ?? storedMember?.nick ?? null,
					roles: data.member?.roles ?? storedMember?.roles ?? [],
					joined_at: data.member?.joined_at ?? storedMember?.joinedAt,
					guild_id: data.guild_id
				}
			: undefined

		// Broadcast to Stage clients
		getStageServer().broadcastToSession(id, {
			type: 'voice_state_update',
			data: {
				guild_id: data.guild_id,
				channel_id: data.channel_id,
				user_id: data.user_id,
				self_mute: data.self_mute ?? false,
				self_deaf: data.self_deaf ?? false,
				mute: data.mute ?? false,
				deaf: data.deaf ?? false,
				speaking: data.speaking,
				member: stageMember
			}
		})

		return {
			success: true,
			dispatched: session.connections.size,
			user_id: data.user_id,
			channel_id: data.channel_id,
			voice_server_update: isBotUser && isJoiningVoice
		}
	}

	// For other events, dispatch raw data
	await session.dispatch(body.event, body.data)

	return {
		success: true,
		dispatched: session.connections.size
	}
}
