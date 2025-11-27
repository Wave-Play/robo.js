import {
	type ChatInputCommandInteraction,
	type BaseInteraction,
	ButtonStyle,
	PermissionFlagsBits,
	type InteractionReplyOptions,
	type InteractionEditReplyOptions,
	type ForumChannel,
	type CategoryChannel,
	StringSelectMenuBuilder,
	UserSelectMenuBuilder,
	MessageFlags,
	ContainerBuilder,
	SectionBuilder,
	TextDisplayBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	ActionRowBuilder,
	ButtonBuilder,
	Colors
} from 'discord.js'
import { createCommandConfig, logger, type CommandResult } from 'robo.js'
import { createOrGetRoadmapCategory } from '../../core/forum-manager.js'
import {
	getSettings,
	getAuthorizedCreatorRoles,
	getAssigneeMapping,
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

	// Fetch cards to get known Jira assignee names (if sync has been run)
	let knownJiraAssignees: string[] = []
	if (settings.lastSyncTimestamp) {
		try {
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
		} catch (error) {
			logger.warn('Failed to fetch cards for assignee mapping:', error)
			// Continue without assignee names - mapping will be disabled
		}
	}

	// Build interactive setup message with current state
	const setupMessage = await createSetupMessage(
		interaction,
		category,
		forums,
		settings,
		knownJiraAssignees
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
export async function createSetupMessage(
	interaction: BaseInteraction,
	category: CategoryChannel,
	forums: Map<string, ForumChannel>,
	settings: RoadmapSettings,
	knownJiraAssignees: string[] = []
): Promise<InteractionReplyOptions & InteractionEditReplyOptions> {
	const isPublic = settings.isPublic ?? false
	const authorizedRoles = getAuthorizedCreatorRoles(interaction.guildId!)
	const assigneeMapping = getAssigneeMapping(interaction.guildId!)
	const mappingCount = Object.keys(assigneeMapping).length

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

	// Build container with accent color
	const container = new ContainerBuilder()
		.setAccentColor(Colors.Blurple)
		.addSectionComponents(statusSection)

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

	// Build assignee mappings section with thumbnails
	if (mappingCount > 0) {
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
		)

		const mappingEntries = Object.entries(assigneeMapping).slice(0, 10) // Show up to 10 mappings

		for (const [jiraName, discordUserId] of mappingEntries) {
			// Note: Displaying Jira name here is acceptable because this is an admin-only setup UI.
			// In all other contexts (Discord messages, public APIs), provider names must be redacted
			// via the assignee mapping system. See AGENTS.md "Assignee Name Redaction Contract" section.
			const mappingSection = new SectionBuilder().addTextDisplayComponents([
				new TextDisplayBuilder().setContent(`**${jiraName}**`),
				new TextDisplayBuilder().setContent(`Mapped to <@${discordUserId}>`)
			])

			// Note: Sections can have EITHER a button OR a thumbnail accessory, not both
			// Using button accessory for remove functionality
			// Thumbnails can be added later if the validation issue is resolved
			mappingSection.setButtonAccessory(
				new ButtonBuilder()
					.setCustomId(`${Buttons.RemoveAssigneeMapping.id}:${jiraName}`)
					.setLabel('Remove')
					.setStyle(ButtonStyle.Danger)
					.setEmoji('🗑️')
			)

			container.addSectionComponents(mappingSection)
		}

		if (mappingCount > 10) {
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent(
					`... and ${mappingCount - 10} more mapping${mappingCount - 10 === 1 ? '' : 's'}`
				)
			)
		}
	} else if (settings.lastSyncTimestamp && knownJiraAssignees.length > 0) {
		// Show empty state if sync has been run but no mappings exist
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
		)
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent('**Assignee Mappings**'),
			new TextDisplayBuilder().setContent('No mappings yet. Use the select menus below to create mappings.')
		)
	}

	// Build action rows for interactive components (no role select - it's in an ephemeral message now)
	const actionRows: ActionRowBuilder<
		ButtonBuilder | StringSelectMenuBuilder | UserSelectMenuBuilder
	>[] = []

	// Add assignee mapping components if sync has been run and we have known assignees
	if (settings.lastSyncTimestamp && knownJiraAssignees.length > 0) {
		// Add a dedicated section for adding new mappings
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
		)

		const addMappingSection = new SectionBuilder()
			.addTextDisplayComponents([
				new TextDisplayBuilder().setContent('**Add New Mapping**'),
				new TextDisplayBuilder().setContent(
					'Click the button below to map a Jira assignee to a Discord user.'
				)
			])
			.setButtonAccessory(
				new ButtonBuilder()
					.setCustomId(Buttons.AddAssigneeMapping.id)
					.setLabel('Add Mapping')
					.setStyle(ButtonStyle.Primary)
					.setEmoji('➕')
			)

		container.addSectionComponents(addMappingSection)
	} else if (!settings.lastSyncTimestamp) {
		// Show guidance if sync hasn't been run
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
		)
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				'💡 **Assignee Mapping:** Run `/roadmap sync` once to discover Jira assignees and enable mapping.'
			)
		)
	}

	// Add last sync timestamp at the end if available
	if (settings.lastSyncTimestamp) {
		container.addSeparatorComponents(
			new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
		)
		container.addTextDisplayComponents(
			new TextDisplayBuilder().setContent(
				`**Last Synced:** ${new Date(settings.lastSyncTimestamp).toLocaleString()}`
			)
		)
	}

	return {
		flags: MessageFlags.IsComponentsV2,
		components: [container, ...actionRows]
	}
}
