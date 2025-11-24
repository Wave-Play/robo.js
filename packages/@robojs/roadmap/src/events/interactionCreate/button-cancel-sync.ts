import { type ButtonInteraction, PermissionFlagsBits } from 'discord.js'
import { type EventConfig } from 'robo.js'
import { Buttons } from '../../core/constants.js'
import { roadmapLogger } from '../../core/logger.js'
import { activeSyncs } from '../../commands/roadmap/sync.js'

/**
 * Handles cancel button clicks for active roadmap sync operations.
 *
 * Each cancel button custom ID is generated as `${Buttons.CancelSync.id}-${syncId}` so the
 * handler can extract the sync identifier directly from the interaction payload. When
 * triggered, the handler verifies that the user is either an administrator or the person
 * who started the sync before aborting the associated sync loop. The main sync command
 * listens for the abort signal and is responsible for updating the UI with partial results.
 *
 * Edge cases handled:
 * - Sync not found (already completed or canceled)
 * - Unauthorized user attempts
 * - Invalid or malformed custom IDs
 */
export const config: EventConfig = {
	description: 'Cancels an active roadmap sync operation when the cancel button is clicked'
}

export default async (interaction: ButtonInteraction) => {
	if (
		!interaction.isButton() ||
		!interaction.customId.startsWith(Buttons.CancelSync.id + '-')
	) {
		return
	}

	try {
		const syncId = interaction.customId.slice(Buttons.CancelSync.id.length + 1)

		if (!syncId) {
			await interaction.deferUpdate()
			await interaction.followUp({
				content: 'Invalid sync cancel request.',
				ephemeral: true
			})
			return
		}

		await interaction.deferUpdate()

		if (!interaction.guildId || !interaction.guild) {
			await interaction.followUp({
				content: 'This action can only be performed in a server.',
				ephemeral: true
			})
			return
		}

		const syncData = activeSyncs.get(syncId)
		if (!syncData) {
			await interaction.followUp({
				content: 'This sync has already completed or was canceled.',
				ephemeral: true
			})
			return
		}

		const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false
		const isStarter = interaction.user.id === syncData.startedBy

		if (!isAdmin && !isStarter) {
			roadmapLogger.debug(
				`User @${interaction.user.username} is not authorized to cancel sync ${syncId} in guild ${interaction.guildId}`
			)
			await interaction.followUp({
				content: 'Only administrators or the user who started this sync can cancel it.',
				ephemeral: true
			})
			return
		}

		syncData.controller.abort()

		const requesterRole = isAdmin ? 'administrator' : 'sync-starter'
		roadmapLogger.info(
			`Sync ${syncId} cancellation requested by @${interaction.user.username} (${requesterRole}) in guild ${interaction.guildId}`
		)

		await interaction.followUp({
			content: 'Sync cancellation requested. The sync will stop after the current card completes.',
			ephemeral: true
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		roadmapLogger.error(`Failed to cancel sync via button: ${message}`)

		try {
			await interaction.followUp({
				content: `Failed to cancel sync: ${message}`,
				ephemeral: true
			})
		} catch {
			// no-op if we cannot send a follow-up (e.g., already acknowledged elsewhere)
		}
	}
}

