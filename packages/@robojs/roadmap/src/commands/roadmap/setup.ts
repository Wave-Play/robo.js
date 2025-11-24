import {
	type ChatInputCommandInteraction,
	type BaseInteraction,
	ComponentType,
	ButtonStyle,
	PermissionFlagsBits,
	type InteractionReplyOptions,
	type InteractionEditReplyOptions,
	type ForumChannel,
	type CategoryChannel
} from 'discord.js'
import { createCommandConfig, logger, type CommandResult } from 'robo.js'
import { createOrGetRoadmapCategory } from '../../core/forum-manager.js'
import { getSettings, getAuthorizedCreatorRoles, type RoadmapSettings } from '../../core/settings.js'
import { Buttons, Selects } from '../../core/constants.js'
import { getProvider } from '../../events/_start.js'

/**
 * Setup command for the roadmap plugin.
 *
 * This command creates or retrieves the roadmap forum channel and provides an interactive
 * interface for administrators to configure forum access settings. The setup is idempotent,
 * meaning it can be run multiple times safely.
 *
 * @example
 * // Admin runs: /roadmap setup
 * // Bot creates forum channel (if needed) and displays:
 * // - Forum channel link
 * // - Current access mode (public/private)
 * // - Toggle button to change access
 * // - Last sync timestamp
 */

export const config = createCommandConfig({
	description: 'Sets up the roadmap forum channel for this server',
	defaultMemberPermissions: PermissionFlagsBits.Administrator,
	dmPermission: false
} as const)

export default async (interaction: ChatInputCommandInteraction): Promise<CommandResult> => {
	// Validate guild context is available
	if (!interaction.guildId) {
		return 'This command can only be run in a server'
	}

	if (!interaction.guild) {
		return 'This command can only be run in a server'
	}

	// Defer reply to prevent timeout during setup
	await interaction.deferReply({ ephemeral: true })

	// Get provider instance and validate readiness
	const provider = getProvider()
	if (!provider) {
		return 'Roadmap provider is not configured. Set up your provider credentials and restart the bot.'
	}

	// Fetch columns from provider to create forums
	let columns
	try {
		columns = await provider.getColumns()
	} catch (error) {
		logger.error('Failed to get provider columns:', error)

		return 'Failed to retrieve provider columns. Check your provider configuration.'
	}

	// Create or retrieve roadmap category and forum channels
	let category: CategoryChannel
	let forums: Map<string, ForumChannel>
	try {
		const result = await createOrGetRoadmapCategory({ guild: interaction.guild, columns: [...columns] })
		category = result.category
		forums = result.forums
	} catch (error) {
		logger.error('Failed to setup roadmap category:', error)

		return 'Failed to create roadmap category. Ensure the bot has Manage Channels permission.'
	}

	// Log successful setup
	logger.debug(`Roadmap category ready with ${forums.size} forum channels`)

	// Load current settings for display
	const settings = getSettings(interaction.guildId)

	// Build interactive setup message with current state
	const setupMessage = createSetupMessage(interaction, category, forums, settings)

	logger.info(`Setup command executed by @${interaction.user.username} in guild ${interaction.guildId}`)

	return setupMessage as CommandResult
}

/**
 * Creates the setup message with current forum status and interactive components.
 *
 * The message includes:
 * - Category mention
 * - List of forum channel mentions
 * - Current access mode (public with commenting vs private admin/mod only)
 * - Authorized creator roles
 * - Last sync timestamp (if available)
 * - Toggle button with label and style reflecting current state
 * - Role select menu for choosing authorized creator roles
 *
 * @param interaction - The command interaction
 * @param category - The roadmap category channel
 * @param forums - Map of column names to forum channels
 * @param settings - Current guild settings
 * @returns Message options for the setup interface
 */
export function createSetupMessage(
	interaction: BaseInteraction,
	category: CategoryChannel,
	forums: Map<string, ForumChannel>,
	settings: RoadmapSettings
): InteractionReplyOptions & InteractionEditReplyOptions {
	// Determine current access mode
	const isPublic = settings.isPublic ?? false

	// Build status information section (optimized for quick scanning)
	let content = '✅ **Roadmap forums are ready.**\n'
	content += `**Access Mode:** ${isPublic ? 'Public (read-only with comments)' : 'Private (admin/mod only)'}\n`
	content += '**Next step:** Run `/roadmap sync` to pull cards.\n'

	// Brief roles explanation near the top
	const authorizedRoles = getAuthorizedCreatorRoles(interaction.guildId!)
	content +=
		'**Who can create cards:** Administrators and the authorized roles listed below.\n\n'

	// Category and forums
	content += `**Roadmap Category:** ${category.toString()}\n`
	content += '**Forum Channels:**\n'
	for (const [columnName, forum] of forums.entries()) {
		content += `  • ${forum.toString()} (${columnName})\n`
	}

	// Authorized roles list
	content += '\n**Authorized Creator Roles:**'
	if (authorizedRoles.length > 0) {
		content += '\n'
		for (const roleId of authorizedRoles) {
			content += `  • <@&${roleId}>\n`
		}
	} else {
		content += ' None (only admins can create cards)\n'
	}

	// Add last sync timestamp if available
	if (settings.lastSyncTimestamp) {
		content += `\n**Last Synced:** ${new Date(settings.lastSyncTimestamp).toLocaleString()}\n`
	}

	// Short, scannable guidance lines
	content += '\n• Toggle public/private access with the button below.'
	content += '\n• Use the role selector to choose who can create roadmap cards.'
	content +=
		'\n• Public mode: everyone can view and comment; only admins and authorized roles can create cards.'

	// Build toggle button with state-based styling
	const toggleButton = {
		type: ComponentType.Button,
		customId: Buttons.TogglePublic.id,
		label: isPublic ? 'Make Private' : 'Make Public',
		style: isPublic ? ButtonStyle.Secondary : ButtonStyle.Primary,
		emoji: isPublic ? '🔒' : '🌐'
	}

	// Build role select menu for authorization
	const roleSelect = {
		type: ComponentType.RoleSelect,
		customId: Selects.AuthorizedCreatorRoles.id,
		placeholder: 'Select roles that can create roadmap cards',
		minValues: 0,
		maxValues: 10
	}

	// Assemble components into action rows
	const components = [
		{
			type: ComponentType.ActionRow,
			components: [toggleButton]
		},
		{
			type: ComponentType.ActionRow,
			components: [roleSelect]
		}
	]

	return { content, components }
}
