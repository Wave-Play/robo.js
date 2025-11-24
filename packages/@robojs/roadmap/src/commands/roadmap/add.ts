/**
 * Roadmap card creation command
 *
 * This command allows authorized users to create new roadmap cards in the external provider
 * (e.g., Jira). It validates authorization, creates the card, triggers a sync to display it
 * in Discord, and provides feedback on the operation.
 *
 * Authorization:
 * - Administrators are always authorized
 * - Users with roles configured in /roadmap setup are authorized
 * - All other users are denied
 *
 * Prerequisites:
 * - Roadmap provider must be initialized (check via isProviderReady)
 * - Forum channels must be set up (via /roadmap setup)
 * - User must be authorized (admin or have an authorized role)
 *
 * Features:
 * - Creates card in external provider with title, description, column, issue type, and labels
 * - Dynamic autocomplete for issue types, columns, and labels from the provider
 * - Labels autocomplete supports comma-separated input (e.g., "bug, enhan" autocompletes "bug, enhancement")
 * - Configurable autocomplete cache TTL via plugin options (default 5 minutes)
 * - Automatically syncs the new card to Discord forums
 * - Comprehensive error handling with user-friendly messages
 * - Ephemeral replies to keep card creation private
 *
 * @module
 */

import type { ChatInputCommandInteraction, AutocompleteInteraction } from 'discord.js'
import { EmbedBuilder, PermissionFlagsBits } from 'discord.js'
import { createCommandConfig } from 'robo.js'
import type { CommandResult } from 'robo.js'
import { getProvider, isProviderReady, options } from '../../events/_start.js'
import { canUserCreateCards } from '../../core/settings.js'
import type { CreateCardInput } from '../../types.js'
import { syncSingleCard } from '../../core/sync-engine.js'
import { getAllForumChannels } from '../../core/forum-manager.js'
import { roadmapLogger } from '../../core/logger.js'

// Autocomplete cache with TTL
let cacheTtlWarningLogged = false
const getAutocompleteCacheTtl = () => {
	const DEFAULT_TTL = 300000 // 5 minutes
	const rawValue = options.autocompleteCacheTtl

	// Parse as number
	let parsedValue: number
	if (typeof rawValue === 'number') {
		parsedValue = rawValue
	} else if (typeof rawValue === 'string') {
		parsedValue = Number(rawValue)
	} else {
		return DEFAULT_TTL
	}

	// Validate and clamp
	if (!Number.isFinite(parsedValue) || parsedValue < 0) {
		if (!cacheTtlWarningLogged) {
			roadmapLogger.warn(
				`Invalid autocompleteCacheTtl value "${rawValue}" in roadmap plugin options. Using default ${DEFAULT_TTL}ms; autocomplete suggestions may refresh less often than expected until this is corrected.`
			)
			cacheTtlWarningLogged = true
		}
		return DEFAULT_TTL
	}

	// Clamp to non-negative (already checked, but being explicit)
	const clampedValue = Math.max(0, parsedValue)

	if (clampedValue !== parsedValue && !cacheTtlWarningLogged) {
		roadmapLogger.debug(
			`Clamped autocompleteCacheTtl from ${parsedValue} to ${clampedValue}ms for roadmap autocomplete cache. This controls how long card, column, and label suggestions stay cached per guild.`
		)
		cacheTtlWarningLogged = true
	}

	return clampedValue
}
const autocompleteCache = new Map<
	string,
	{
		issueTypes?: { data: string[]; timestamp: number }
		columns?: { data: string[]; timestamp: number }
		labels?: { data: string[]; timestamp: number }
	}
>()

/**
 * Jira-specific metadata structure for issue type information.
 */
interface JiraIssueMetadata {
	readonly issue?: {
		readonly fields?: {
			readonly issuetype?: {
				readonly name?: string
			}
		}
	}
}

/**
 * Command configuration
 *
 * Allows authorized users to create roadmap cards. Authorization is checked at runtime
 * based on role configuration, not via defaultMemberPermissions.
 */
export const config = createCommandConfig({
	description: 'Creates a new roadmap card',
	dmPermission: false,
	options: [
		{
			name: 'title',
			description: 'Card title or summary',
			type: 'string',
			required: true
		},
		{
			name: 'description',
			description: 'Detailed card description',
			type: 'string',
			required: true
		},
		{
			name: 'column',
			description: 'Target column',
			type: 'string',
			required: true,
			autocomplete: true
		},
		{
			name: 'issue-type',
			description: 'Issue type (e.g., Task, Story, Bug)',
			type: 'string',
			required: false,
			autocomplete: true
		},
		{
			name: 'labels',
			description: 'Comma-separated labels from your provider (e.g., "bug, urgent"); autocompletes provider labels',
			type: 'string',
			required: false,
			autocomplete: true
		}
	]
} as const)

/**
 * Roadmap card creation command handler
 *
 * Validates authorization, creates the card in the external provider, triggers a sync,
 * and provides detailed feedback about the operation.
 *
 * Flow:
 * 1. Validate guild context
 * 2. Defer reply (ephemeral)
 * 3. Check user authorization (admin or authorized role)
 * 4. Check provider initialization
 * 5. Validate forum setup
 * 6. Parse command options (title, description, column, issue-type, labels)
 * 7. Validate column against provider columns
 * 8. Create card via provider (issue type from input or default)
 * 9. Sync the new card to Discord (targeted sync)
 * 10. Format and send results (including issue type)
 *
 * Error handling:
 * - Unauthorized users: Directs to /roadmap setup for role configuration
 * - Missing configuration: Provides actionable setup guidance
 * - Missing forum: Directs user to run /roadmap setup
 * - Invalid column: Lists valid columns
 * - Provider errors: Categorizes and provides specific feedback
 * - Sync errors: Notes that card was created but may need manual sync
 *
 * @param interaction - Discord command interaction
 * @returns Result message or void
 *
 * @example
 * User runs: /roadmap add title:"Add dark mode" description:"Implement dark theme" column:Backlog labels:"enhancement, ui"
 * Response: Rich embed with:
 * - Title: "Card Created Successfully"
 * - Color: Success green (#57F287)
 * - Description: Discord thread link
 * - Fields: ID, Title, Column, Labels, Provider URL
 * - Footer: "Synced to Discord forums"
 */
export default async function (interaction: ChatInputCommandInteraction): Promise<CommandResult> {
	// Validate guild context is available
	if (!interaction.guildId) {
		return 'This command can only be run in a server'
	}

	if (!interaction.guild) {
		return 'This command can only be run in a server'
	}

	// Defer reply (ephemeral by default; configurable via plugin options)
	await interaction.deferReply({ ephemeral: options.ephemeralCommands ?? true })

	// Extract user roles for authorization check
	const userRoleIds =
		interaction.member?.roles instanceof Array
			? interaction.member.roles
			: Array.from(interaction.member?.roles?.cache?.values() ?? []).map((r) => r.id)
	const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false

	// Check user authorization (admin or authorized role)
	if (!canUserCreateCards(interaction.guildId, userRoleIds, isAdmin)) {
		return "You don't have permission to create roadmap cards. Ask an administrator to authorize your role in /roadmap setup."
	}

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

	// Parse command options
	const title = interaction.options.getString('title', true)
	const description = interaction.options.getString('description', true)
	const column = interaction.options.getString('column', true)
	const issueType = interaction.options.getString('issue-type')
	const labelsStr = interaction.options.getString('labels')

	// Parse labels from comma-separated string
	const labels = labelsStr
		? labelsStr
				.split(',')
				.map((l) => l.trim())
				.filter(Boolean)
		: []

	// Track any labels that don't exist in the provider for UX feedback
	let unknownLabels: string[] = []
	if (labels.length > 0) {
		try {
			const providerLabels = await provider.getLabels()
			const providerLabelSet = new Set(providerLabels.map((label) => label.toLowerCase()))
			unknownLabels = labels.filter((label) => !providerLabelSet.has(label.toLowerCase()))

			if (unknownLabels.length > 0) {
				roadmapLogger.debug(
					`Unknown labels requested for new card in guild ${interaction.guildId}: ${unknownLabels.join(', ')}`
				)
			}
		} catch (error) {
			roadmapLogger.warn('Failed to validate labels against provider labels:', error)
		}
	}

	// Log card creation attempt
	roadmapLogger.debug(
		`Creating roadmap card: "${title}" in column "${column}" by @${interaction.user.username} in guild ${interaction.guildId}`
	)

	// Validate column against provider columns
	try {
		const columns = await provider.getColumns()

		// Find matching column
		const validColumn = columns.find((col) => col.name === column)
		if (!validColumn) {
			const columnNames = columns.map((col) => col.name).join(', ')

			return `Invalid column "${column}". Available columns: ${columnNames}`
		}

		// Check if column is archived
		if (validColumn.archived) {
			return `Cannot create cards in archived column "${column}". Choose a different column.`
		}
	} catch (error) {
		roadmapLogger.error('Failed to get provider columns:', error)

		return 'Failed to retrieve provider columns. Check your provider configuration.'
	}

	// Build CreateCardInput with optional fields
	const input: CreateCardInput = {
		title,
		description,
		column,
		labels,
		...(issueType ? { issueType } : {})
	}

	// Create card via provider
	let result
	try {
		result = await provider.createCard(input)

		// Check creation success
		if (!result.success) {
			throw new Error(result.message || 'Card creation failed')
		}
	} catch (error) {
		// Normalize error message safely
		const message = error instanceof Error ? error.message : String(error)
		const errorMessage = message.toLowerCase()

		// Categorize authentication errors
		if (errorMessage.includes('authentication') || errorMessage.includes('credentials')) {
			roadmapLogger.error('Card creation failed due to authentication:', error)

			return 'Provider authentication failed. Contact an administrator to check provider credentials.'
		}

		// Categorize validation errors
		if (errorMessage.includes('validation') || errorMessage.includes('invalid') || errorMessage.includes('required')) {
			roadmapLogger.error('Card creation failed due to validation:', error)

			return `Invalid card data: ${message}`
		}

		// Categorize network errors
		if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('reach')) {
			roadmapLogger.error('Card creation failed due to network:', error)

			return 'Unable to reach provider. Try again later.'
		}

		// Categorize configuration errors
		if (errorMessage.includes('project') || errorMessage.includes('issue type')) {
			roadmapLogger.error('Card creation failed due to configuration:', error)

			return `Provider configuration error: ${message}. Contact an administrator.`
		}

		// Generic error fallback
		roadmapLogger.error('Card creation failed:', error)

		return `Failed to create card: ${message}`
	}

	// Log successful creation
	roadmapLogger.info(
		`Card created successfully: ${result.card.id} by @${interaction.user.username} in guild ${interaction.guildId}`
	)

	// Sync the new card to Discord (targeted, not full sync)
	let syncSuccess = true
	let threadId: string | undefined
	try {
		const syncResult = await syncSingleCard(result.card, guild, provider)
		if (syncResult) {
			threadId = syncResult.threadId
			roadmapLogger.debug(`Synced card ${result.card.id} to thread ${threadId}`)
		} else {
			roadmapLogger.debug(`Skipped syncing card ${result.card.id} (likely archived column)`)
		}
	} catch (error) {
		roadmapLogger.error('Failed to sync card after creation:', error)
		syncSuccess = false
	}

	// Build success response with embed
	try {
		// Create embed
		const embed = new EmbedBuilder().setTitle('Card Created Successfully').setColor(0x57f287) // Success green

		// Set description with Discord thread link if available
		if (threadId) {
			embed.setDescription(`Discord thread: <#${threadId}>`)
		}

		// Add fields
		const fields = []
		fields.push({ name: 'ID', value: result.card.id, inline: true })

		// Truncate title if needed (max 1024 chars for embed field values)
		const titleValue =
			result.card.title.length > 1024 ? result.card.title.substring(0, 1021) + '...' : result.card.title
		fields.push({ name: 'Title', value: titleValue, inline: true })

		fields.push({ name: 'Column', value: result.card.column, inline: true })

		// Add labels field if present (truncate with +N more indicator)
		if (result.card.labels.length > 0) {
			const maxLabels = 20 // Reasonable limit before truncation
			let labelsValue: string
			if (result.card.labels.length > maxLabels) {
				const visibleLabels = result.card.labels.slice(0, maxLabels)
				const remaining = result.card.labels.length - maxLabels
				labelsValue = visibleLabels.join(', ') + ` +${remaining} more`
			} else {
				labelsValue = result.card.labels.join(', ')
			}
			// Final safety check for 1024 char limit
			if (labelsValue.length > 1024) {
				labelsValue = labelsValue.substring(0, 1021) + '...'
			}
			fields.push({ name: 'Labels', value: labelsValue, inline: true })
		}

		// Add issue type field if available
		const createdIssueType = (result.card.metadata as JiraIssueMetadata)?.issue?.fields?.issuetype?.name
		if (createdIssueType) {
			fields.push({ name: 'Issue Type', value: createdIssueType, inline: true })
		}

		// Add provider URL field if available (full width)
		if (result.card.url) {
			fields.push({ name: 'Provider URL', value: result.card.url, inline: false })
		}

		embed.addFields(fields)

		// Set footer with sync status (and optional label hint)
		let footerText = syncSuccess
			? 'Synced to Discord forums'
			: '⚠️ Created but sync failed - run /roadmap sync to update forums'

		if (unknownLabels.length > 0) {
			const sampleUnknown =
				unknownLabels.length > 3
					? `${unknownLabels.slice(0, 3).join(', ')} +${unknownLabels.length - 3} more`
					: unknownLabels.join(', ')
			footerText += ` • Note: some labels may not exist in the provider (${sampleUnknown}).`
		}

		if (syncSuccess) {
			embed.setFooter({ text: footerText })
		} else {
			embed.setFooter({ text: footerText })
		}

		return { embeds: [embed] }
	} catch (error) {
		// Fallback to plain text response if embed building fails
		roadmapLogger.error('Failed to build embed response:', error)

		let response = '**Card Created Successfully**\n\n'
		response += `**ID:** ${result.card.id}\n`
		response += `**Title:** ${result.card.title}\n`
		response += `**Column:** ${result.card.column}\n`
		if (result.card.labels.length > 0) {
			response += `**Labels:** ${result.card.labels.join(', ')}\n`
		}

		const createdIssueType = (result.card.metadata as JiraIssueMetadata)?.issue?.fields?.issuetype?.name
		if (createdIssueType) {
			response += `**Issue Type:** ${createdIssueType}\n`
		}

		if (result.card.url) {
			response += `**URL:** ${result.card.url}\n`
		}

		if (threadId) {
			response += `**Discord Thread:** <#${threadId}>\n`
		}

		if (syncSuccess) {
			response += '\nThe card has been synced to the roadmap forums.'
		} else {
			response +=
				'\n⚠️ The card was created but could not be synced automatically. Run `/roadmap sync` to update the forums.'
		}

		if (unknownLabels.length > 0) {
			const sampleUnknown =
				unknownLabels.length > 3
					? `${unknownLabels.slice(0, 3).join(', ')} +${unknownLabels.length - 3} more`
					: unknownLabels.join(', ')
			response += `\n\nNote: some labels may not exist in the provider (${sampleUnknown}).`
		}

		return response
	}
}

/**
 * Autocomplete handler for the add command.
 *
 * @remarks
 * Provides autocomplete suggestions for the 'issue-type', 'column', and 'labels' options.
 * Results are cached per guild with a configurable TTL (default 5 minutes) to minimize provider API calls.
 *
 * For issue-type:
 * - Fetches available issue types from the provider via getIssueTypes()
 * - Filters based on user input (case-insensitive partial match)
 * - Returns up to 25 matching choices
 *
 * For column:
 * - Fetches available columns from the provider via getColumns()
 * - Filters out archived columns
 * - Filters based on user input
 * - Returns up to 25 matching choices
 *
 * For labels:
 * - Fetches available labels from the provider via getLabels()
 * - Supports comma-separated input: parses "bug, enhan" as prefix "bug, " + search term "enhan"
 * - Filters labels by the last search term (case-insensitive partial match)
 * - Returns choices with the prefix preserved (e.g., "bug, enhancement", "bug, enterprise")
 * - Returns up to 25 matching choices
 *
 * @param interaction - Discord autocomplete interaction
 * @returns Array of autocomplete choices
 */
export async function autocomplete(interaction: AutocompleteInteraction) {
	try {
		// Check guild context
		if (!interaction.guildId) {
			return []
		}

		// Get focused option
		const focusedOption = interaction.options.getFocused(true)

		// Handle issue-type autocomplete
		if (focusedOption.name === 'issue-type') {
			// Check provider readiness
			if (!isProviderReady()) {
				return []
			}

			const provider = getProvider()
			if (!provider) {
				return []
			}

			// Get or initialize guild cache
			let guildCache = autocompleteCache.get(interaction.guildId)
			if (!guildCache) {
				guildCache = {}
				autocompleteCache.set(interaction.guildId, guildCache)
			}

			let issueTypes: string[]
			const now = Date.now()

			// Check cache freshness
			if (guildCache.issueTypes && now - guildCache.issueTypes.timestamp < getAutocompleteCacheTtl()) {
				// Use cached data
				issueTypes = guildCache.issueTypes.data
			} else {
				// Fetch from provider if cache stale
				try {
					const types = await provider.getIssueTypes()
					const uniqueMap = new Map<string, string>()
					for (const type of types) {
						const lowerKey = type.toLowerCase()
						if (!uniqueMap.has(lowerKey)) {
							uniqueMap.set(lowerKey, type)
						}
					}
					issueTypes = Array.from(uniqueMap.values())
					const duplicateCount = types.length - issueTypes.length
					if (duplicateCount > 0) {
						roadmapLogger.debug(
							`Deduplicated ${duplicateCount} duplicate issue types for guild ${interaction.guildId}`
						)
					}

					// Update cache
					guildCache.issueTypes = {
						data: issueTypes,
						timestamp: now
					}
				} catch (error) {
					roadmapLogger.error('Failed to fetch issue types for autocomplete:', error)

					return []
				}
			}

			// Filter by user input
			const userInput = focusedOption.value.toLowerCase()
			const filtered = issueTypes.filter((type) => type.toLowerCase().includes(userInput))

			// Return up to 25 choices
			return filtered.slice(0, 25).map((type) => ({
				name: type,
				value: type
			}))
		}

		// Handle column autocomplete
		if (focusedOption.name === 'column') {
			// Check provider readiness
			if (!isProviderReady()) {
				return []
			}

			const provider = getProvider()
			if (!provider) {
				return []
			}

			// Check cache
			let guildCache = autocompleteCache.get(interaction.guildId)
			if (!guildCache) {
				guildCache = {}
				autocompleteCache.set(interaction.guildId, guildCache)
			}

			let columns: string[]
			const now = Date.now()

			// Check cache freshness
			if (guildCache.columns && now - guildCache.columns.timestamp < getAutocompleteCacheTtl()) {
				// Use cached data
				columns = guildCache.columns.data
			} else {
				// Fetch from provider
				try {
					const providerColumns = await provider.getColumns()
					// Filter out archived columns and extract names
					columns = providerColumns.filter((col) => !col.archived).map((col) => col.name)

					// Update cache
					guildCache.columns = {
						data: columns,
						timestamp: now
					}
				} catch (error) {
					roadmapLogger.error('Failed to fetch columns for autocomplete:', error)
					return []
				}
			}

			// Filter by user input
			const userInput = focusedOption.value.toLowerCase()
			const filtered = columns.filter((col) => col.toLowerCase().includes(userInput))

			// Return up to 25 choices
			return filtered.slice(0, 25).map((col) => ({
				name: col,
				value: col
			}))
		}

		// Handle labels autocomplete
		if (focusedOption.name === 'labels') {
			// Check provider readiness
			if (!isProviderReady()) {
				return []
			}

			const provider = getProvider()
			if (!provider) {
				return []
			}

			// Check cache
			let guildCache = autocompleteCache.get(interaction.guildId)
			if (!guildCache) {
				guildCache = {}
				autocompleteCache.set(interaction.guildId, guildCache)
			}

			let labels: string[]
			const now = Date.now()

			if (guildCache.labels && now - guildCache.labels.timestamp < getAutocompleteCacheTtl()) {
				// Use cached data
				labels = guildCache.labels.data
			} else {
				// Fetch from provider
				try {
					const providerLabels = await provider.getLabels()
					labels = [...providerLabels]

					// Update cache
					guildCache.labels = {
						data: labels,
						timestamp: now
					}
				} catch (error) {
					roadmapLogger.error('Failed to fetch labels for autocomplete:', error)
					return []
				}
			}

			// Parse comma-separated input
			const userInput = focusedOption.value
			const parts = userInput.split(',').map((p: string) => p.trim())

			// Extract prefix (all parts except the last) and search term (last part)
			const prefix = parts.length > 1 ? parts.slice(0, -1).join(', ') + ', ' : ''
			const searchTerm = parts[parts.length - 1]?.toLowerCase() || ''

			// Filter labels by search term
			const filtered = labels.filter((label) => label.toLowerCase().includes(searchTerm))

			// Map to choices with prefix
			return filtered.slice(0, 25).map((label) => ({
				name: prefix ? `${prefix}${label}` : label,
				value: prefix ? `${prefix}${label}` : label
			}))
		}

		// Unknown focused option
		return []
	} catch (error) {
		roadmapLogger.error('Error in autocomplete handler:', error)
		return []
	}
}
