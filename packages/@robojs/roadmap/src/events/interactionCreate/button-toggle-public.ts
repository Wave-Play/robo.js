import { type ButtonInteraction, PermissionFlagsBits } from 'discord.js'
import { logger, type EventConfig } from 'robo.js'
import { toggleForumAccess, getRoadmapCategory, getAllForumChannels } from '../../core/forum-manager.js'
import { getSettings, isForumPublic } from '../../core/settings.js'
import { Buttons } from '../../core/constants.js'
import { createSetupMessage } from '../../commands/roadmap/setup.js'
import { getProvider } from '../_start.js'

/**
 * Button interaction handler for toggling roadmap category access between public and private modes.
 *
 * This handler processes clicks on the toggle button displayed in the setup command.
 * It validates permissions, updates Discord category permissions (which cascade to all forums),
 * persists settings, and refreshes the setup message with the new state.
 *
 * Access modes:
 * - Private: Only administrators and moderators can view the roadmap category and forums
 * - Public: Everyone can view and comment on threads, but only admins/mods can create new threads
 *
 * @remarks
 * Uses `deferUpdate()` instead of `deferReply()` because we're updating the existing
 * setup message rather than creating a new reply. This provides a seamless UX where
 * the button label and style automatically reflect the new state.
 *
 * @example
 * // User clicks "Make Public" button in setup message
 * // Handler:
 * // 1. Validates user has Administrator permission
 * // 2. Updates category permissions (cascades to all forum channels)
 * // 3. Saves isPublic: true in settings
 * // 4. Updates setup message (button now shows "Make Private")
 * // 5. Sends confirmation message
 */

export const config: EventConfig = {
	description: 'Toggles roadmap forum between public (read-only) and private (admin/mod only) access'
}

export default async (interaction: ButtonInteraction) => {
	// Filter interaction - only process our specific button
	if (!interaction.isButton() || interaction.customId !== Buttons.TogglePublic.id) {
		return
	}

	// Acknowledge interaction immediately to prevent timeout
	await interaction.deferUpdate()

	// Validate guild context is available
	if (!interaction.guildId) {
		await interaction.followUp({
			content: 'This action can only be performed in a server',
			ephemeral: true
		})

		return
	}

	if (!interaction.guild) {
		await interaction.followUp({
			content: 'This action can only be performed in a server',
			ephemeral: true
		})

		return
	}

	// Validate user has Administrator permission
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
		logger.debug(`User @${interaction.user.username} does not have permission to toggle forum access`)
		await interaction.followUp({
			content: "You don't have permission to use this. Only administrators can change forum access settings.",
			ephemeral: true
		})

		return
	}

	// Determine new access mode (toggle current state)
	const currentlyPublic = isForumPublic(interaction.guildId)
	const newMode = currentlyPublic ? 'private' : 'public'

	// Log the access mode change
	logger.debug(
		`Toggling forum access for guild ${interaction.guildId} from ${currentlyPublic ? 'public' : 'private'} to ${newMode}`
	)

	// Apply permission changes to category and forums
	try {
		await toggleForumAccess(interaction.guild, newMode)
	} catch (error) {
		logger.error('Failed to toggle category access:', error)
		await interaction.followUp({
			content: 'Failed to update category permissions. Ensure the bot has Manage Channels permission.',
			ephemeral: true
		})

		return
	}

	// Retrieve updated category after permission changes
	const category = await getRoadmapCategory(interaction.guild)
	if (!category) {
		logger.error('Roadmap category not found after toggle')
		await interaction.followUp({
			content: 'Failed to retrieve roadmap category after update',
			ephemeral: true
		})

		return
	}

	// Retrieve updated forums after permission changes
	const forums = await getAllForumChannels(interaction.guild)
	if (forums.size === 0) {
		logger.error('No forum channels found after toggle')
		await interaction.followUp({
			content: 'Failed to retrieve forum channels after update',
			ephemeral: true
		})

		return
	}

	// Update setup message with new state
	const settings = getSettings(interaction.guildId)
	
	// Fetch known Jira assignees for the select menu
	let knownJiraAssignees: string[] = []
	if (settings.lastSyncTimestamp) {
		try {
			const provider = getProvider()
			if (provider) {
				const cards = await provider.fetchCards()
				const assigneeSet = new Set<string>()
				for (const card of cards) {
					for (const assignee of card.assignees) {
						if (assignee.name && assignee.name !== 'Unassigned') {
							assigneeSet.add(assignee.name)
						}
					}
				}
				knownJiraAssignees = Array.from(assigneeSet).sort()
			}
		} catch (error) {
			logger.warn('Failed to fetch cards for assignee mapping refresh:', error)
		}
	}
	
	const setupMessage = await createSetupMessage(interaction, category, forums, settings, knownJiraAssignees)
	await interaction.editReply(setupMessage)

	// Build confirmation message based on new mode
	const confirmationMessage =
		`Category and all forum channels changed to ${newMode} mode. ` +
		(newMode === 'public'
			? 'Everyone can now view the roadmap and comment on threads (read-only for new posts).'
			: 'Only administrators and moderators can now view the roadmap.')

	// Send confirmation to user
	await interaction.followUp({
		content: confirmationMessage,
		ephemeral: true
	})

	// Log successful access mode change
	logger.info(`Roadmap access changed to ${newMode} mode by @${interaction.user.username}`)
}
