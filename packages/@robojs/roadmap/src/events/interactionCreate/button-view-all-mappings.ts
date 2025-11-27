import { type ButtonInteraction, PermissionFlagsBits, MessageFlags, ContainerBuilder, SectionBuilder, TextDisplayBuilder, ButtonBuilder, ButtonStyle, Colors, SeparatorBuilder, SeparatorSpacingSize } from 'discord.js'
import { type EventConfig } from 'robo.js'
import { Buttons } from '../../core/constants.js'
import { roadmapLogger } from '../../core/logger.js'
import { getAssigneeMapping, getColumnMapping } from '../../core/settings.js'

/**
 * Handles viewing all mappings in an ephemeral message.
 *
 * This handler processes clicks on the "View All" button that appears when there are
 * more mappings than can be displayed on the provider settings page. It shows a complete
 * list of either assignee or column mappings in an ephemeral message.
 */
export const config: EventConfig = {
	description: 'Shows all mappings in an ephemeral message when there are too many to display on the setup page'
}

export default async (interaction: ButtonInteraction) => {
	// Filter interaction - only process our specific button
	if (
		!interaction.isButton() ||
		!interaction.customId.startsWith(Buttons.ViewAllMappings.id + ':')
	) {
		return
	}

	try {
		// Extract mapping type from custom ID: ${Buttons.ViewAllMappings.id}:${type}
		const prefix = `${Buttons.ViewAllMappings.id}:`
		const mappingType = interaction.customId.slice(prefix.length)

		if (mappingType !== 'assignee' && mappingType !== 'column') {
			await interaction.deferReply({ ephemeral: true })
			await interaction.followUp({
				content: 'Invalid mapping type.',
				ephemeral: true
			})
			return
		}

		await interaction.deferReply({ ephemeral: true })

		// Validate guild context
		if (!interaction.guildId || !interaction.guild) {
			await interaction.followUp({
				content: 'This action can only be performed in a server.',
				ephemeral: true
			})
			return
		}

		// Validate user has Administrator permission
		if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
			roadmapLogger.debug(`User @${interaction.user.username} does not have permission to view mappings`)
			await interaction.followUp({
				content: "You don't have permission to use this. Only administrators can view mappings.",
				ephemeral: true
			})
			return
		}

		const container = new ContainerBuilder().setAccentColor(Colors.Blurple)

		if (mappingType === 'assignee') {
			const assigneeMapping = getAssigneeMapping(interaction.guildId)
			const entries = Object.entries(assigneeMapping)

			if (entries.length === 0) {
				await interaction.followUp({
					content: 'No assignee mappings configured.',
					ephemeral: true
				})
				return
			}

			const headingSection = new SectionBuilder().addTextDisplayComponents([
				new TextDisplayBuilder().setContent(`**All Assignee Mappings** (${entries.length})`),
				new TextDisplayBuilder().setContent('Map Jira assignees to Discord users')
			])
			headingSection.setButtonAccessory(
				new ButtonBuilder()
					.setCustomId(Buttons.ViewAllMappings.id + ':placeholder')
					.setLabel('\u200b') // Zero-width space
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(true)
			)
			container.addSectionComponents(headingSection)

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
			)

			// Group mappings into chunks to avoid message length limits
			const mappingsList = entries
				.map(([jiraName, discordUserId], index) => {
					// Note: Displaying Jira name here is acceptable because this is an admin-only setup UI.
					return `${index + 1}. **${jiraName}** → <@${discordUserId}>`
				})
				.join('\n')

			// Split into chunks if too long (Discord message limit is 2000 chars)
			const maxChunkLength = 1800
			if (mappingsList.length <= maxChunkLength) {
				container.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(mappingsList)
				)
			} else {
				// Split into multiple text displays
				const lines = entries.map(([jiraName, discordUserId], index) => 
					`${index + 1}. **${jiraName}** → <@${discordUserId}>`
				)
				
				let currentChunk = ''
				for (const line of lines) {
					if (currentChunk.length + line.length + 1 > maxChunkLength) {
						container.addTextDisplayComponents(
							new TextDisplayBuilder().setContent(currentChunk.trim())
						)
						currentChunk = line + '\n'
					} else {
						currentChunk += line + '\n'
					}
				}
				if (currentChunk.trim()) {
					container.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(currentChunk.trim())
					)
				}
			}
		} else {
			// column mappings
			const columnMapping = getColumnMapping(interaction.guildId)
			const entries = Object.entries(columnMapping)

			if (entries.length === 0) {
				await interaction.followUp({
					content: 'No column mappings configured. Using defaults.',
					ephemeral: true
				})
				return
			}

			const headingSection = new SectionBuilder().addTextDisplayComponents([
				new TextDisplayBuilder().setContent(`**All Column Mappings** (${entries.length})`),
				new TextDisplayBuilder().setContent('Custom overrides for provider statuses')
			])
			headingSection.setButtonAccessory(
				new ButtonBuilder()
					.setCustomId(Buttons.ViewAllMappings.id + ':placeholder')
					.setLabel('\u200b') // Zero-width space
					.setStyle(ButtonStyle.Secondary)
					.setDisabled(true)
			)
			container.addSectionComponents(headingSection)

			container.addSeparatorComponents(
				new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
			)

			const mappingsList = entries
				.map(([status, column], index) => {
					const mappingValue = column === null ? 'Track Only (no forum)' : column
					return `${index + 1}. **${status}** → ${mappingValue}`
				})
				.join('\n')

			// Split into chunks if too long
			const maxChunkLength = 1800
			if (mappingsList.length <= maxChunkLength) {
				container.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(mappingsList)
				)
			} else {
				const lines = entries.map(([status, column], index) => {
					const mappingValue = column === null ? 'Track Only (no forum)' : column
					return `${index + 1}. **${status}** → ${mappingValue}`
				})
				
				let currentChunk = ''
				for (const line of lines) {
					if (currentChunk.length + line.length + 1 > maxChunkLength) {
						container.addTextDisplayComponents(
							new TextDisplayBuilder().setContent(currentChunk.trim())
						)
						currentChunk = line + '\n'
					} else {
						currentChunk += line + '\n'
					}
				}
				if (currentChunk.trim()) {
					container.addTextDisplayComponents(
						new TextDisplayBuilder().setContent(currentChunk.trim())
					)
				}
			}
		}

		await interaction.editReply({
			flags: MessageFlags.IsComponentsV2,
			components: [container]
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		roadmapLogger.error(`Failed to show all mappings: ${message}`)

		try {
			await interaction.followUp({
				content: `Failed to load mappings: ${message}`,
				ephemeral: true
			})
		} catch {
			// no-op if we cannot send a follow-up
		}
	}
}

