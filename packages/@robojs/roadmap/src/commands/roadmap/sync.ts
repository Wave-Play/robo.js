/**
 * Manual roadmap sync command
 *
 * This command allows administrators to manually trigger a sync between the roadmap
 * provider (e.g., Jira) and the Discord forum channel. It validates all prerequisites,
 * executes the sync, and provides comprehensive feedback about the results.
 *
 * Prerequisites:
 * - Roadmap provider must be initialized (check via isProviderReady)
 * - Forum channel must be set up (via /roadmap setup)
 * - User must have Administrator permissions
 *
 * Features:
 * - Dry-run mode for testing without applying changes
 * - Comprehensive statistics on created/updated/archived cards
 * - Error categorization for user-friendly feedback
 * - Ephemeral replies to keep sync messages private
 *
 * @module
 */

import type { ChatInputCommandInteraction } from 'discord.js'
import { PermissionFlagsBits } from 'discord.js'
import { createCommandConfig, logger } from 'robo.js'
import type { CommandResult } from 'robo.js'
import { getProvider, isProviderReady } from '../../events/_start.js'
import { syncRoadmap } from '../../core/sync-engine.js'
import { getAllForumChannels } from '../../core/forum-manager.js'

/**
 * Command configuration
 *
 * Restricts the command to administrators only and prevents usage in DMs.
 * Provides a dry-run option for testing sync behavior without applying changes.
 */
export const config = createCommandConfig({
	description: 'Manually syncs the roadmap forum with the latest cards from your provider',
	defaultMemberPermissions: PermissionFlagsBits.Administrator,
	dmPermission: false,
	options: [
		{
			name: 'dry-run',
			description: 'Preview changes without applying them',
			type: 'boolean',
			required: false
		}
	]
} as const)

/**
 * Manual roadmap sync command handler
 *
 * Validates prerequisites, executes the sync, and provides detailed feedback about
 * the sync results including statistics on created, updated, and archived cards.
 *
 * Flow:
 * 1. Validate guild context
 * 2. Defer reply (ephemeral)
 * 3. Check provider initialization
 * 4. Validate forum setup
 * 5. Execute sync
 * 6. Format and send results
 *
 * Error handling:
 * - Missing configuration: Provides actionable setup guidance
 * - Missing forum: Directs user to run /roadmap setup
 * - Missing permissions: Lists required permissions
 * - Authentication errors: Suggests credential verification
 * - Generic errors: Logs details and provides user-friendly message
 *
 * @param interaction - Discord command interaction
 * @returns Result message or void
 *
 * @example
 * User runs: /roadmap sync
 * Response: "Sync Complete
 * Total Cards: 15
 * Created: 3
 * Updated: 5
 * Archived: 2
 * Synced At: 1/1/2024, 12:00:00 PM
 * View the roadmap in #roadmap"
 *
 * @example
 * User runs: /roadmap sync dry-run:true
 * Response: "Dry Run Complete (no changes applied)
 * Total Cards: 15
 * Created: 3
 * Updated: 5
 * Archived: 2
 * ..."
 */
export default async function (interaction: ChatInputCommandInteraction): Promise<CommandResult> {
	// Validate guild context is available
	if (!interaction.guildId) {
		return 'This command can only be run in a server'
	}

	if (!interaction.guild) {
		return 'This command can only be run in a server'
	}

	// Defer reply (ephemeral to keep sync messages private)
	await interaction.deferReply({ ephemeral: true })

	// Check provider initialization status
	if (!isProviderReady()) {
		return (
			'Roadmap provider is not configured. Set up your provider credentials (e.g., JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN) ' +
			'and restart the bot, or configure the provider in your plugin options.'
		)
	}

	// Get provider instance
	const provider = getProvider()
	if (!provider) {
		return 'Roadmap provider is not available. Please check the bot logs for initialization errors.'
	}

	// Validate forum setup exists
	const guild = interaction.guild
	const forums = await getAllForumChannels(guild)
	if (forums.size === 0) {
		return 'Roadmap forums are not set up. Run `/roadmap setup` first to create the forum channels.'
	}

	// Get dry-run option from command
	const dryRun = interaction.options.getBoolean('dry-run') ?? false

	// Log sync start
	logger.info(`Starting roadmap sync (dry-run: ${dryRun}) for guild ${interaction.guildId}`)

	// Execute sync operation
	try {
		const result = await syncRoadmap({ guild, provider, dryRun })

		// Build success response with statistics
		let response = dryRun ? '**Dry Run Complete** (no changes applied)\n\n' : '**Sync Complete**\n\n'
		response += `**Total Cards:** ${result.stats.total}\n`
		response += `**Created:** ${result.stats.created}\n`
		response += `**Updated:** ${result.stats.updated}\n`
		response += `**Archived:** ${result.stats.archived}\n`
		if (result.stats.errors > 0) {
			response += `**Errors:** ${result.stats.errors} (check logs for details)\n`
		}
		response += `\n**Synced At:** ${result.syncedAt.toLocaleString()}\n`
		response += `\nView the roadmap in the following channels:\n${Array.from(forums.values())
			.map((f) => f.toString())
			.join(', ')}`

		// Log completion with stats
		logger.info(
			`Sync completed by @${interaction.user.username} in guild ${interaction.guildId}: ` +
				`${result.stats.created} created, ${result.stats.updated} updated, ` +
				`${result.stats.archived} archived, ${result.stats.errors} errors`
		)

		return response
	} catch (error) {
		// Normalize error message safely
		const message = error instanceof Error ? error.message : String(error)
		const errorMessage = message.toLowerCase()

		// Check for missing forum setup
		if (errorMessage.includes('no roadmap') && errorMessage.includes('configured')) {
			return 'Roadmap forum is not set up. Run `/roadmap setup` first to create the forum channel.'
		}

		// Check for missing permissions
		if (errorMessage.includes('missing permissions')) {
			return (
				'The bot is missing required permissions. Ensure it has "Manage Threads" and ' +
				'"Send Messages in Threads" permissions in the forum channel.'
			)
		}

		// Check for authentication failures
		if (errorMessage.includes('authentication') || errorMessage.includes('credentials')) {
			return (
				'Provider authentication failed. Check your provider credentials ' +
				'(e.g., JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN) and try again.'
			)
		}

		// Generic error fallback
		logger.error('Sync failed:', error)

		return `Sync failed: ${message}. Check the bot logs for more details.`
	}
}
