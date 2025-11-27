import {
	type ChatInputCommandInteraction,
	type BaseInteraction,
	ButtonStyle,
	PermissionFlagsBits,
	type InteractionReplyOptions,
	type InteractionEditReplyOptions,
	type ForumChannel,
	type CategoryChannel,
	MessageFlags,
	ContainerBuilder,
	SectionBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	ButtonBuilder,
	Colors
} from 'discord.js'
import { createCommandConfig, logger, type CommandResult } from 'robo.js'
import { createOrGetRoadmapCategory } from '../../core/forum-manager.js'
import {
	getSettings,
	getAuthorizedCreatorRoles,
	getAssigneeMapping,
	getColumnMapping,
	type RoadmapSettings
} from '../../core/settings.js'
import { Buttons, ID_NAMESPACE } from '../../core/constants.js'
import { getProvider } from '../../events/_start.js'

/**
 * Creates a minimal placeholder button accessory for sections.
 * Required by Discord Components v2, but kept visually minimal with a zero-width label.
 *
 * @param key - Unique key for the placeholder button
 */
function createPlaceholderAccessory(key: string): ButtonBuilder {
	return new ButtonBuilder()
		.setCustomId(`${ID_NAMESPACE}placeholder:${key}`)
		.setLabel('\u200b') // Zero-width space: satisfies length constraint, renders as "empty"
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(true)
}

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

	// Fetch cards to get known Jira assignee names and statuses (if sync has been run)
	let knownJiraAssignees: string[] = []
	let knownStatuses: string[] = []
	if (settings.lastSyncTimestamp) {
		try {
			const cards = await provider.fetchCards()
			const assigneeSet = new Set<string>()
			const statusSet = new Set<string>()
			for (const card of cards) {
				// Collect assignees
				for (const assignee of card.assignees) {
					if (assignee.name && assignee.name !== 'Unassigned') {
						assigneeSet.add(assignee.name)
					}
				}
				// Collect statuses from metadata
				const originalStatus = (card.metadata?.originalStatus as string) || card.column
				if (originalStatus) {
					statusSet.add(originalStatus)
				}
			}
			knownJiraAssignees = Array.from(assigneeSet).sort()
			knownStatuses = Array.from(statusSet).sort()
		} catch (error) {
			logger.warn('Failed to fetch cards for mapping:', error)
			// Continue without assignee names/statuses - mapping will be disabled
		}
	}

	// Build interactive setup message with current state
	const setupMessage = await createSetupMessage(
		interaction,
		category,
		forums,
		settings,
		knownJiraAssignees,
		knownStatuses
	)

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
export type SetupPage = 'overview' | 'provider-settings'

export async function createSetupMessage(
	interaction: BaseInteraction,
	category: CategoryChannel,
	forums: Map<string, ForumChannel>,
	settings: RoadmapSettings,
	knownJiraAssignees: string[] = [],
	knownStatuses: string[] = [],
	page: SetupPage = 'overview'
): Promise<InteractionReplyOptions & InteractionEditReplyOptions> {
	const isPublic = settings.isPublic ?? false
	const authorizedRoles = getAuthorizedCreatorRoles(interaction.guildId!)
	const assigneeMapping = getAssigneeMapping(interaction.guildId!)
	const mappingCount = Object.keys(assigneeMapping).length
	const columnMapping = getColumnMapping(interaction.guildId!)
	const columnMappingCount = Object.keys(columnMapping).length

	// Build container with accent color
	const container = new ContainerBuilder().setAccentColor(Colors.Blurple)

	// Route to appropriate page builder
	if (page === 'provider-settings') {
		return buildProviderSettingsPage(
			container,
			interaction,
			settings,
			knownJiraAssignees,
			knownStatuses,
			assigneeMapping,
			columnMapping,
			mappingCount,
			columnMappingCount
		)
	}

	// Build overview page
	// Build main status section
	const statusSection = new SectionBuilder().addTextDisplayComponents([
		new TextDisplayBuilder().setContent('✅ **Roadmap Forums Ready**'),
		new TextDisplayBuilder().setContent(
			`**Access Mode:** ${isPublic ? 'Public (read-only with comments)' : 'Private (admin/mod only)'}`
		),
		new TextDisplayBuilder().setContent('**Next step:** Run `/roadmap sync` to pull cards.')
	])

	// Add toggle button as accessory
	statusSection.setButtonAccessory(
		new ButtonBuilder()
			.setCustomId(Buttons.TogglePublic.id)
			.setLabel(isPublic ? 'Make Private' : 'Make Public')
			.setStyle(isPublic ? ButtonStyle.Secondary : ButtonStyle.Primary)
			.setEmoji(isPublic ? '🔒' : '🌐')
	)

	container.addSectionComponents(statusSection)

	// Add separator
	container.addSeparatorComponents(
		new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
	)

	// Build forum channels section
	const forumChannelsList = Array.from(forums.entries())
		.map(([columnName, forum]) => `• ${forum.toString()} (${columnName})`)
		.join('\n')

	const forumsSection = new SectionBuilder()
		.addTextDisplayComponents([
			new TextDisplayBuilder().setContent(`**Roadmap Category:** ${category.toString()}`),
			new TextDisplayBuilder().setContent('**Forum Channels:**'),
			new TextDisplayBuilder().setContent(forumChannelsList || 'No forums configured')
		])
		.setButtonAccessory(createPlaceholderAccessory('forums'))

	container.addSectionComponents(forumsSection)

	// Add separator
	container.addSeparatorComponents(
		new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
	)

	// Build authorized roles section
	const rolesList =
		authorizedRoles.length > 0
			? authorizedRoles.map((roleId) => `• <@&${roleId}>`).join('\n')
			: 'None (only admins can create cards)'

	const rolesSection = new SectionBuilder()
		.addTextDisplayComponents([
			new TextDisplayBuilder().setContent('**Authorized Creator Roles**'),
			new TextDisplayBuilder().setContent(
				'Administrators and the authorized roles listed below can create roadmap cards.'
			),
			new TextDisplayBuilder().setContent(rolesList)
		])
		.setButtonAccessory(
			new ButtonBuilder()
				.setCustomId(Buttons.ManageAuthorizedRoles.id)
				.setLabel('Manage Roles')
				.setStyle(ButtonStyle.Secondary)
				.setEmoji('⚙️')
		)

	container.addSectionComponents(rolesSection)

	// Build provider settings summary section (overview page only)
	container.addSeparatorComponents(
		new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
	)

	// Build provider settings summary with clarity about defaults
	const assigneeText = mappingCount > 0 
		? `Assignee mappings: ${mappingCount} custom override${mappingCount === 1 ? '' : 's'}`
		: 'Assignee mappings: Using defaults (none configured)'
	
	const columnText = columnMappingCount > 0
		? `Column mappings: ${columnMappingCount} custom override${columnMappingCount === 1 ? '' : 's'}`
		: 'Column mappings: Using defaults (To Do→Backlog, In Progress→In Progress, Done→Done)'

	const providerSettingsSection = new SectionBuilder().addTextDisplayComponents([
		new TextDisplayBuilder().setContent('**Provider Settings**'),
		new TextDisplayBuilder().setContent(assigneeText),
		new TextDisplayBuilder().setContent(columnText)
	])

	providerSettingsSection.setButtonAccessory(
		new ButtonBuilder()
			.setCustomId(Buttons.SetupProviderSettings.id)
			.setLabel('Manage Provider')
			.setStyle(ButtonStyle.Secondary)
			.setEmoji('⚙️')
	)

	container.addSectionComponents(providerSettingsSection)

	// Add last sync timestamp at the end if available (small text)
	if (settings.lastSyncTimestamp) {
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
		)
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`<t:${Math.floor(settings.lastSyncTimestamp / 1000)}:R> • Last synced`
			)
		)
	}

	// Component budget check (development only)
	if (process.env.NODE_ENV !== 'production') {
		const componentCount = countComponents(container)
		logger.debug(`Setup overview page component count: ${componentCount}`)
		if (componentCount >= 40) {
			logger.warn(`Setup overview page is approaching Discord's 40-component limit: ${componentCount}`)
		}
	}

	return {
		flags: MessageFlags.IsComponentsV2,
		components: [container]
	}
}

/**
 * Builds the provider settings page with assignee and column mappings.
 */
async function buildProviderSettingsPage(
	container: ContainerBuilder,
	interaction: BaseInteraction,
	settings: RoadmapSettings,
	knownJiraAssignees: string[],
	knownStatuses: string[],
	assigneeMapping: Record<string, string>,
	columnMapping: Record<string, string | null>,
	mappingCount: number,
	columnMappingCount: number
): Promise<InteractionReplyOptions & InteractionEditReplyOptions> {
	// Heading section with back button as accessory
	// Combine into single TextDisplay to reduce component count
	const headingSection = new SectionBuilder().addTextDisplayComponents([
		new TextDisplayBuilder().setContent('**Provider Settings**\nManage assignee and column mappings for your provider.')
	])
	headingSection.setButtonAccessory(
		new ButtonBuilder()
			.setCustomId(Buttons.SetupBackOverview.id)
			.setLabel('Back')
			.setStyle(ButtonStyle.Secondary)
			.setEmoji('⬅️')
	)
	container.addSectionComponents(headingSection)

	// Assignee Mappings section
	container.addSeparatorComponents(
		new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
	)

	// Combine explanation into single TextDisplay to reduce component count
	const assigneeExplanationSection = new SectionBuilder().addTextDisplayComponents([
		new TextDisplayBuilder().setContent('**Assignee Mappings**\nMap Jira assignees to Discord users')
	])
	assigneeExplanationSection.setButtonAccessory(createPlaceholderAccessory('assignee-explanation'))
	container.addSectionComponents(assigneeExplanationSection)

	// Show assignee mappings (limit to 2 to stay under component budget)
	// Each mapping = 1 Section + 1 TextDisplay = 2 components
	// With separators, explanation sections, and buttons, we need to be very conservative
	const MAX_MAPPINGS_PER_SECTION = 2
	const assigneeEntries = Object.entries(assigneeMapping).slice(0, MAX_MAPPINGS_PER_SECTION)

		if (assigneeEntries.length > 0) {
		for (const [jiraName, discordUserId] of assigneeEntries) {
			// Note: Displaying Jira name here is acceptable because this is an admin-only setup UI.
			// In all other contexts (Discord messages, public APIs), provider names must be redacted
			// via the assignee mapping system. See AGENTS.md "Assignee Name Redaction Contract" section.
			// Combine into single TextDisplay to reduce component count
			const mappingSection = new SectionBuilder().addTextDisplayComponents([
				new TextDisplayBuilder().setContent(`**${jiraName}** → <@${discordUserId}>`)
			])

			mappingSection.setButtonAccessory(
				new ButtonBuilder()
					.setCustomId(`${Buttons.RemoveAssigneeMapping.id}:${jiraName}`)
					.setLabel('Remove')
					.setStyle(ButtonStyle.Danger)
					.setEmoji('🗑️')
			)

			container.addSectionComponents(mappingSection)
		}

		if (mappingCount > MAX_MAPPINGS_PER_SECTION) {
			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
			)
			
			const viewAllSection = new SectionBuilder()
				.addTextDisplayComponents([
					new TextDisplayBuilder().setContent(
						`Showing ${MAX_MAPPINGS_PER_SECTION} of ${mappingCount} assignee mapping${mappingCount === 1 ? '' : 's'}`
					)
				])
				.setButtonAccessory(
					new ButtonBuilder()
						.setCustomId(`${Buttons.ViewAllMappings.id}:assignee`)
						.setLabel('View All')
						.setStyle(ButtonStyle.Secondary)
						.setEmoji('📋')
				)
			
			container.addSectionComponents(viewAllSection)
		}
	} else if (settings.lastSyncTimestamp && knownJiraAssignees.length > 0) {
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent('No assignee mappings yet.')
		)
	} else if (!settings.lastSyncTimestamp) {
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				'💡 Run `/roadmap sync` once to discover Jira assignees and enable mapping.'
			)
		)
	}

	// Add assignee mapping button if sync has been run
	if (settings.lastSyncTimestamp && knownJiraAssignees.length > 0) {
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
		)

		const addAssigneeSection = new SectionBuilder()
			.addTextDisplayComponents([
				new TextDisplayBuilder().setContent('Add a new assignee mapping')
			])
			.setButtonAccessory(
				new ButtonBuilder()
					.setCustomId(Buttons.AddAssigneeMapping.id)
					.setLabel('Add Mapping')
					.setStyle(ButtonStyle.Primary)
					.setEmoji('➕')
			)

		container.addSectionComponents(addAssigneeSection)
	}

	// Column Mappings section
	container.addSeparatorComponents(
		new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
	)

	// Combine explanation into single TextDisplay to reduce component count
	const columnExplanationText = columnMappingCount > 0
		? '**Column Mappings**\nCustom overrides (defaults: To Do→Backlog, In Progress→In Progress, Done→Done)'
		: '**Column Mappings**\nDefaults active: To Do→Backlog, In Progress→In Progress, Done→Done. Add custom mappings to override.'
	
	const columnExplanationSection = new SectionBuilder().addTextDisplayComponents([
		new TextDisplayBuilder().setContent(columnExplanationText)
	])
	columnExplanationSection.setButtonAccessory(createPlaceholderAccessory('column-explanation'))
	container.addSectionComponents(columnExplanationSection)

	// Show column mappings (limit to 3 to stay under component budget)
	const columnEntries = Object.entries(columnMapping).slice(0, MAX_MAPPINGS_PER_SECTION)

		if (columnEntries.length > 0) {
		for (const [status, column] of columnEntries) {
			const mappingValue = column === null ? 'Track Only (no forum)' : column
			// Combine into single TextDisplay to reduce component count
			const mappingSection = new SectionBuilder().addTextDisplayComponents([
				new TextDisplayBuilder().setContent(`**${status}** → ${mappingValue}`)
			])

			mappingSection.setButtonAccessory(
				new ButtonBuilder()
					.setCustomId(`${Buttons.RemoveColumnMapping.id}:${status}`)
					.setLabel('Remove')
					.setStyle(ButtonStyle.Danger)
					.setEmoji('🗑️')
			)

			container.addSectionComponents(mappingSection)
		}

		if (columnMappingCount > MAX_MAPPINGS_PER_SECTION) {
			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
			)
			
			const viewAllSection = new SectionBuilder()
				.addTextDisplayComponents([
					new TextDisplayBuilder().setContent(
						`Showing ${MAX_MAPPINGS_PER_SECTION} of ${columnMappingCount} column mapping${columnMappingCount === 1 ? '' : 's'}`
					)
				])
				.setButtonAccessory(
					new ButtonBuilder()
						.setCustomId(`${Buttons.ViewAllMappings.id}:column`)
						.setLabel('View All')
						.setStyle(ButtonStyle.Secondary)
						.setEmoji('📋')
				)
			
			container.addSectionComponents(viewAllSection)
		}
	} else if (settings.lastSyncTimestamp && knownStatuses.length > 0) {
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				'✅ Using default mappings (To Do→Backlog, In Progress→In Progress, Done→Done). Add custom mappings to override specific statuses.'
			)
		)
	} else if (!settings.lastSyncTimestamp) {
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				'💡 Default mappings are active. Run `/roadmap sync` once to discover provider statuses and add custom overrides if needed.'
			)
		)
	}

	// Add column mapping button if sync has been run
	if (settings.lastSyncTimestamp && knownStatuses.length > 0) {
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
		)

		const addColumnSection = new SectionBuilder()
			.addTextDisplayComponents([
				new TextDisplayBuilder().setContent('Add a new column mapping')
			])
			.setButtonAccessory(
				new ButtonBuilder()
					.setCustomId(Buttons.AddColumnMapping.id)
					.setLabel('Add Mapping')
					.setStyle(ButtonStyle.Primary)
					.setEmoji('➕')
			)

		container.addSectionComponents(addColumnSection)
	}


	// Component budget check (development only)
	if (process.env.NODE_ENV !== 'production') {
		const componentCount = countComponents(container)
		logger.debug(`Setup provider settings page component count: ${componentCount}`)
		if (componentCount >= 40) {
			logger.warn(`Setup provider settings page is approaching Discord's 40-component limit: ${componentCount}`)
		}
	}

	return {
		flags: MessageFlags.IsComponentsV2,
		components: [container]
	}
}

/**
 * Counts the total number of components in a container for budget tracking.
 * This is a rough estimate for debugging - Discord counts components differently
 * (sections, separators, text displays, buttons all count toward the 40 limit).
 */
function countComponents(container: ContainerBuilder): number {
	// Try to access internal structure for counting (may not work in all cases)
	try {
		const internal = container as unknown as {
			sections?: unknown[]
			separators?: unknown[]
			textDisplays?: unknown[]
		}
		
		let count = 0
		if (internal.sections) count += internal.sections.length
		if (internal.separators) count += internal.separators.length
		if (internal.textDisplays) count += internal.textDisplays.length
		
		return count
	} catch {
		// If we can't access internal structure, return 0 (component counting is best-effort)
		return 0
	}
}
