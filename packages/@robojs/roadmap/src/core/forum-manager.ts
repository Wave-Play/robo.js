/**
 * Forum channel management for roadmap synchronization.
 *
 * This module handles the creation, configuration, and permission management
 * of Discord forum channels used to display roadmap cards. It follows Discord.js v14
 * patterns for forum channels with support for tags, permission overwrites, and
 * read-only public access.
 *
 * All operations are idempotent - calling them multiple times with the same
 * parameters will not create duplicate channels or redundant permission changes.
 *
 * @see https://discord.js.org/#/docs/discord.js/main/class/ForumChannel
 * @see https://discord.js.org/#/docs/discord.js/main/typedef/PermissionOverwriteOptions
 */

import type { Guild, ForumChannel, CategoryChannel, OverwriteResolvable, GuildForumTagData } from 'discord.js'
import { ChannelType, PermissionFlagsBits } from 'discord.js'
import { client } from 'robo.js'
import { getSettings, updateSettings } from './settings.js'
import type { RoadmapColumn } from '../types.js'
import { roadmapLogger } from './logger.js'

/**
 * Options for creating roadmap category and forum channels.
 */
export interface CreateRoadmapForumsOptions {
	/**
	 * The Discord guild where the category and forums will be created.
	 */
	guild: Guild

	/**
	 * Array of columns from the provider to create forums for.
	 * Each column will get its own dedicated forum channel.
	 */
	columns: RoadmapColumn[]
}

/**
 * Forum permission modes.
 *
 * - `private`: Only administrators and moderators can view the forum
 * - `public`: Everyone can view and read, but only admins/mods can create posts or reply
 */
export type ForumPermissionMode = 'private' | 'public'

/**
 * Creates or retrieves the roadmap category with forum channels for each column (idempotent).
 *
 * @param options - Guild and columns to create forums for.
 * @returns Category and map of column names to forum channels.
 * @throws Error if bot lacks Manage Channels permission.
 *
 * @example
 * ```ts
 * const { category, forums } = await createOrGetRoadmapCategory({
 *   guild: interaction.guild,
 *   columns: [{ id: 'backlog', name: 'Backlog', order: 0 }]
 * });
 * ```
 */
export async function createOrGetRoadmapCategory(
	options: CreateRoadmapForumsOptions
): Promise<{ category: CategoryChannel; forums: Map<string, ForumChannel> }> {
	try {
		const { guild, columns } = options
		const settings = getSettings(guild.id)
		const forums = new Map<string, ForumChannel>()

		// Check if category already exists in settings
		let category: CategoryChannel | null = null
		if (settings.categoryId) {
			const existingCategory = guild.channels.cache.get(settings.categoryId)
			if (existingCategory && existingCategory.type === ChannelType.GuildCategory) {
				category = existingCategory as CategoryChannel
				roadmapLogger.debug(`Roadmap category already exists: ${category.name}`)
			} else {
				roadmapLogger.warn(
					`Stored category ${settings.categoryId} no longer exists or is not a category, will create new one`
				)
			}
		}

		// Check if forum channels already exist for columns
		if (category && settings.forumChannels) {
			for (const column of columns) {
				const channelId = settings.forumChannels[column.name]
				if (channelId) {
					const existingChannel = guild.channels.cache.get(channelId)
					if (existingChannel && existingChannel.type === ChannelType.GuildForum) {
						forums.set(column.name, existingChannel as ForumChannel)
						roadmapLogger.debug(`Forum channel for ${column.name} already exists: #${existingChannel.name}`)
					}
				}
			}

			// If all non-archived forums exist, return early (idempotent)
			const nonArchivedCount = columns.filter((col) => !col.archived).length
			if (forums.size === nonArchivedCount) {
				roadmapLogger.debug('All forum channels already exist, skipping creation')

				return { category, forums }
			}
		}

		// Build permission overwrites for category (private by default)
		const botId = client.user?.id ?? guild.members.me?.id
		const permissions: OverwriteResolvable[] = [
			// Deny @everyone by default (private mode)
			{
				id: guild.roles.everyone.id,
				deny: [PermissionFlagsBits.ViewChannel]
			},
			// Allow guild owner
			{
				id: guild.ownerId,
				allow: [PermissionFlagsBits.ViewChannel]
			}
		]

		// Allow bot to manage threads
		if (botId) {
			permissions.push({
				id: botId,
				allow: [
					PermissionFlagsBits.ViewChannel,
					PermissionFlagsBits.CreatePublicThreads,
					PermissionFlagsBits.SendMessagesInThreads,
					PermissionFlagsBits.ManageThreads
				]
			})
		}

		// Find and allow moderator role
		const moderatorRole = guild.roles.cache.find(
			(role) =>
				role.permissions.has(PermissionFlagsBits.ModerateMembers) ||
				role.permissions.has(PermissionFlagsBits.ManageThreads) ||
				/\b(moderator|mod)\b/i.test(role.name)
		)
		if (moderatorRole) {
			permissions.push({
				id: moderatorRole.id,
				allow: [
					PermissionFlagsBits.ViewChannel,
					PermissionFlagsBits.CreatePublicThreads,
					PermissionFlagsBits.SendMessagesInThreads
				]
			})
		}

		// Find and allow admin role (if different from moderator)
		const adminRole = guild.roles.cache.find(
			(role) => role.permissions.has(PermissionFlagsBits.Administrator) && !role.managed
		)
		if (adminRole && adminRole.id !== moderatorRole?.id) {
			permissions.push({
				id: adminRole.id,
				allow: [
					PermissionFlagsBits.ViewChannel,
					PermissionFlagsBits.CreatePublicThreads,
					PermissionFlagsBits.SendMessagesInThreads
				]
			})
		}

		// Create category if it doesn't exist
		if (!category) {
			category = (await guild.channels.create({
				name: 'Roadmap',
				type: ChannelType.GuildCategory,
				permissionOverwrites: permissions,
				reason: 'Roadmap category created by @robojs/roadmap'
			})) as CategoryChannel

			roadmapLogger.info(`Created roadmap category in guild ${guild.name}`)
		}

		// Create forum channels for each non-archived column
		for (const column of columns) {
			// Skip if forum already exists for this column
			if (forums.has(column.name)) {
				continue
			}

			// Skip archived columns
			if (column.archived) {
				roadmapLogger.debug(`Skipping archived column: ${column.name}`)

				continue
			}

			// Determine topic based on column name
			let topic: string
			switch (column.name) {
				case 'Backlog':
					topic = 'Planned features and improvements'
					break
				case 'In Progress':
					topic = 'Currently in development'
					break
				case 'Done':
					topic = 'Completed items'
					break
				default:
					topic = `${column.name} items`
			}

			// Create forum channel
			const forumChannel = (await guild.channels.create({
				name: column.name.toLowerCase().replace(/\s+/g, '-'),
				topic,
				type: ChannelType.GuildForum,
				parent: category.id,
				permissionOverwrites: [],
				availableTags: [],
				reason: 'Roadmap forum channel created by @robojs/roadmap'
			})) as ForumChannel

			forums.set(column.name, forumChannel)
			roadmapLogger.info(`Created forum channel #${forumChannel.name} for column ${column.name}`)
		}

		// Update settings with new category and forum IDs
		const forumChannels = Object.fromEntries(Array.from(forums.entries()).map(([name, forum]) => [name, forum.id]))
		updateSettings(guild.id, {
			categoryId: category.id,
			forumChannels,
			isPublic: false
		})

		return { category, forums }
	} catch (error) {
		roadmapLogger.error(`Failed to create roadmap category in guild ${options.guild.id}:`, error)
		throw new Error('Unable to create roadmap category. Ensure the bot has Manage Channels permission.')
	}
}

/**
 * Toggles roadmap category between private (admin/mod only) and public (everyone can view/comment).
 *
 * @param guild - Discord guild.
 * @param mode - 'private' or 'public'.
 * @throws Error if category not configured or bot lacks permissions.
 *
 * @example
 * ```ts
 * await toggleForumAccess(guild, 'public');
 * ```
 */
export async function toggleForumAccess(guild: Guild, mode: ForumPermissionMode): Promise<void> {
	try {
		// Retrieve category channel
		const settings = getSettings(guild.id)
		if (!settings.categoryId) {
			throw new Error('No roadmap category configured for this guild')
		}

		const channel = guild.channels.cache.get(settings.categoryId)
		if (!channel || channel.type !== ChannelType.GuildCategory) {
			throw new Error('Roadmap category not found or invalid')
		}

		const category = channel as CategoryChannel

		// Get bot ID for permission preservation
		const botId = client.user?.id ?? guild.members.me?.id

		// Apply permission mode to category
		if (mode === 'private') {
			// Clear all @everyone permissions and set to ViewChannel: false
			await category.permissionOverwrites.edit(
				guild.roles.everyone.id,
				{
					ViewChannel: false,
					ReadMessageHistory: null,
					CreatePublicThreads: null,
					SendMessagesInThreads: null,
					CreatePrivateThreads: null
				},
				{ reason: 'Set roadmap category to private' }
			)

			// Ensure bot retains thread permissions in private mode
			if (botId) {
				await category.permissionOverwrites.edit(
					botId,
					{
						ViewChannel: true,
						CreatePublicThreads: true,
						SendMessagesInThreads: true,
						ManageThreads: true
					},
					{ reason: 'Preserve bot thread permissions in private mode' }
				)
			}

			roadmapLogger.info(`Set roadmap category to private (admin/mod only)`)
		} else if (mode === 'public') {
			// Set @everyone to view and comment on existing threads
			await category.permissionOverwrites.edit(
				guild.roles.everyone.id,
				{
					ViewChannel: true,
					ReadMessageHistory: true,
					CreatePublicThreads: false,
					SendMessagesInThreads: true,
					CreatePrivateThreads: false
				},
				{ reason: 'Set roadmap category to public with commenting' }
			)

			// Ensure bot retains thread permissions in public mode
			if (botId) {
				await category.permissionOverwrites.edit(
					botId,
					{
						ViewChannel: true,
						CreatePublicThreads: true,
						SendMessagesInThreads: true,
						ManageThreads: true
					},
					{ reason: 'Preserve bot thread permissions in public mode' }
				)
			}

			// Ensure moderator role has full posting permissions in public mode
			const moderatorRole = guild.roles.cache.find(
				(role) =>
					role.permissions.has(PermissionFlagsBits.ModerateMembers) ||
					role.permissions.has(PermissionFlagsBits.ManageThreads) ||
					/\b(moderator|mod)\b/i.test(role.name)
			)
			if (moderatorRole) {
				await category.permissionOverwrites.edit(
					moderatorRole.id,
					{
						ViewChannel: true,
						CreatePublicThreads: true,
						SendMessagesInThreads: true
					},
					{ reason: 'Ensure moderator posting permissions in public category' }
				)
			}

			// Ensure admin role has full posting permissions in public mode
			const adminRole = guild.roles.cache.find(
				(role) => role.permissions.has(PermissionFlagsBits.Administrator) && !role.managed
			)
			if (adminRole && adminRole.id !== moderatorRole?.id) {
				await category.permissionOverwrites.edit(
					adminRole.id,
					{
						ViewChannel: true,
						CreatePublicThreads: true,
						SendMessagesInThreads: true
					},
					{ reason: 'Ensure admin posting permissions in public category' }
				)
			}

			roadmapLogger.info(`Set roadmap category to public (view and comment)`)
		}

		// Update settings
		updateSettings(guild.id, {
			isPublic: mode === 'public'
		})
	} catch (error) {
		roadmapLogger.error(`Failed to toggle category access in guild ${guild.id}:`, error)
		throw new Error('Failed to update category permissions. Ensure the bot has Manage Channels permission.')
	}
}

/**
 * Updates forum tags for a column by merging new tags with existing ones (max 20 tags).
 *
 * @param guild - Discord guild.
 * @param columnName - Column name (e.g., 'Backlog').
 * @param tagNames - Tag names to add.
 *
 * @example
 * ```ts
 * await updateForumTagsForColumn(guild, 'Backlog', ['Feature', 'Bug']);
 * ```
 */
export async function updateForumTagsForColumn(guild: Guild, columnName: string, tagNames: string[]): Promise<void> {
	try {
		// Retrieve forum channel for the column
		const settings = getSettings(guild.id)
		if (!settings.forumChannels?.[columnName]) {
			throw new Error(`No forum channel configured for column ${columnName}`)
		}

		const channelId = settings.forumChannels[columnName]
		const channel = guild.channels.cache.get(channelId)
		if (!channel || channel.type !== ChannelType.GuildForum) {
			throw new Error(`Forum channel for column ${columnName} not found or invalid`)
		}

		const forumChannel = channel as ForumChannel

		// Merge tags with case-insensitive deduplication
		const existingTags = forumChannel.availableTags
		const existingTagNamesLower = new Set(existingTags.map((tag) => tag.name.toLowerCase()))

		const newTagNames = tagNames.filter((name) => !existingTagNamesLower.has(name.toLowerCase()))
		const newTags: GuildForumTagData[] = newTagNames.map((name) => ({
			name,
			moderated: false
		}))

		const allTags = [...existingTags, ...newTags].slice(0, 20) // Discord limit: 20 tags

		// Update channel
		await forumChannel.setAvailableTags(allTags, `Update ${columnName} forum tags from sync`)
		roadmapLogger.info(
			`Updated tags for ${columnName} forum: added ${newTags.length} new tags, total ${allTags.length}`
		)
	} catch (error) {
		// Tag updates are non-critical, log warning instead of throwing
		roadmapLogger.warn(`Failed to update forum tags for column ${columnName} in guild ${guild.id}:`, error)
	}
}

/**
 * Retrieves the roadmap category for a guild.
 *
 * This is a helper function for validation before operations. It returns
 * null if no category is configured or if the channel was deleted.
 *
 * @param guild - The Discord guild
 * @returns The category channel, or null if not found
 *
 * @example
 * ```ts
 * const category = await getRoadmapCategory(guild);
 * if (!category) {
 *   return interaction.reply('No roadmap category configured. Run /roadmap setup first.');
 * }
 * ```
 */
export async function getRoadmapCategory(guild: Guild): Promise<CategoryChannel | null> {
	const settings = getSettings(guild.id)
	if (!settings.categoryId) {
		return null
	}

	const channel = guild.channels.cache.get(settings.categoryId)
	if (!channel || channel.type !== ChannelType.GuildCategory) {
		return null
	}

	return channel as CategoryChannel
}

/**
 * Retrieves a specific forum channel for a column.
 *
 * This is a helper function for validation before operations on a specific
 * column's forum. It returns null if no forum is configured for the column
 * or if the channel was deleted.
 *
 * @param guild - The Discord guild
 * @param columnName - The column name (e.g., 'Backlog', 'In Progress', 'Done')
 * @returns The forum channel for the column, or null if not found
 *
 * @example
 * ```ts
 * const backlogForum = await getForumChannelForColumn(guild, 'Backlog');
 * if (!backlogForum) {
 *   return interaction.reply('No Backlog forum configured. Run /roadmap setup first.');
 * }
 * ```
 */
export async function getForumChannelForColumn(guild: Guild, columnName: string): Promise<ForumChannel | null> {
	const settings = getSettings(guild.id)
	if (!settings.forumChannels?.[columnName]) {
		return null
	}

	const channelId = settings.forumChannels[columnName]
	const channel = guild.channels.cache.get(channelId)
	if (!channel || channel.type !== ChannelType.GuildForum) {
		return null
	}

	return channel as ForumChannel
}

/**
 * Retrieves all forum channels for a guild, mapped by column name.
 *
 * This is a helper function for operations that need to work with all forums.
 * It returns an empty map if no forums are configured.
 *
 * @param guild - The Discord guild
 * @returns Map of column names to forum channels
 *
 * @example
 * ```ts
 * const forums = await getAllForumChannels(guild);
 * if (forums.size === 0) {
 *   return interaction.reply('No roadmap forums configured. Run /roadmap setup first.');
 * }
 *
 * // Proceed with sync across all forums
 * for (const [columnName, forum] of forums.entries()) {
 *   console.log(`Processing ${columnName} forum`);
 * }
 * ```
 */
export async function getAllForumChannels(guild: Guild): Promise<Map<string, ForumChannel>> {
	const settings = getSettings(guild.id)
	const forums = new Map<string, ForumChannel>()

	if (!settings.forumChannels) {
		return forums
	}

	for (const [columnName, channelId] of Object.entries(settings.forumChannels)) {
		const channel = guild.channels.cache.get(channelId)
		if (channel && channel.type === ChannelType.GuildForum) {
			forums.set(columnName, channel as ForumChannel)
		}
	}

	return forums
}
