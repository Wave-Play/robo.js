import { Modals, TextInputs } from './constants.js'
import { getSettings } from './settings.js'
import { client, logger, setState } from 'robo.js'
import { ChannelType, ComponentType, TextInputStyle } from 'discord.js'
import type {
	MessageCreateOptions,
	Collection,
	Guild,
	Message,
	BaseInteraction,
	PermissionResolvable,
	ChatInputCommandInteraction,
	ModalSubmitInteraction
} from 'discord.js'

const MAX_MESSAGES_PER_CHANNEL = 100
const MAX_DELETIONS = 5
const BATCH_FETCH_LIMIT = 20
const MESSAGE_AGE_LIMIT_MS = 1_209_600_000 // 14 days in milliseconds
const RATE_LIMIT_DELAY_MS = 1_000 // Delay in milliseconds to avoid rate limits

// TODO: Delete based on time span instead of number of messages
export async function deleteRecentUserMessages(guild: Guild, targetUserId: string) {
	let deletedCount = 0

	for (const channel of guild.channels.cache.values()) {
		// Check if the channel is text-based and if the deletion count is less than the max deletions
		if (!channel.isTextBased() || deletedCount >= MAX_DELETIONS) {
			continue
		}

		let fetchedCount = 0
		let lastMessageId = null

		// Fetch and process messages in batches until the limit is reached or enough messages are deleted
		while (fetchedCount < MAX_MESSAGES_PER_CHANNEL && deletedCount < MAX_DELETIONS) {
			try {
				// Fetch messages with the specified limit and starting point
				const messages: Collection<string, Message<true>> = await channel.messages.fetch({
					before: lastMessageId ?? undefined,
					limit: Math.min(BATCH_FETCH_LIMIT, MAX_MESSAGES_PER_CHANNEL - fetchedCount)
				})

				// Update the fetched count and check if there are messages to process
				fetchedCount += messages.size
				if (messages.size === 0) {
					break
				}

				// Iterate over the fetched messages
				for (const message of messages.values()) {
					// Check if the message is from the target user and within the age limit
					if (message.author.id === targetUserId && Date.now() - message.createdTimestamp < MESSAGE_AGE_LIMIT_MS) {
						try {
							await message.delete()
							logger.debug(`Deleted message ${message.id} from channel ${channel.name}`)
							deletedCount++

							// Break if the max number of deletions has been reached
							if (deletedCount >= MAX_DELETIONS) {
								break
							}

							// Delay to avoid hitting rate limits
							await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS))
						} catch (error) {
							logger.warn(`Error deleting message:`, error)
						}
					}

					// Update the last message ID for the next batch fetch
					lastMessageId = message.id
				}
			} catch (error) {
				logger.warn(`Error fetching messages from channel ${channel.name}:`, error)
				break
			}
		}
	}

	logger.debug(`Deleted ${deletedCount} messages from the user.`)
	return { deletedCount }
}

export async function logAction(guildId: string | null, message: MessageCreateOptions) {
	if (!guildId) {
		return
	}

	const { logsChannelId } = getSettings(guildId)
	if (!logsChannelId) {
		logger.debug(`Missing logs channel for guild ${guildId}`)
		return
	}

	const guild = client.guilds.cache.get(guildId)
	const logsChannel = guild?.channels.cache.get(logsChannelId)
	if (!logsChannel || logsChannel.type !== ChannelType.GuildText) {
		logger.debug(`Invalid logs channel for guild ${guildId}`)
		return
	}

	await logsChannel.send({
		components: message.components,
		content: message.content,
		embeds: message.embeds
	})
}

export function hasPermission(interaction: BaseInteraction, permission: PermissionResolvable): boolean {
	// Validate channel
	const channel = interaction.channel
	if (!channel || !channel.isTextBased() || channel.isDMBased()) {
		return false
	}

	// Add self to logs channel if needed
	const userId = interaction.member?.user?.id as string
	if (!channel.permissionsFor(userId)?.has(permission)) {
		return false
	}

	return true
}

export async function isBanned(guild: Guild, userId: string): Promise<boolean> {
	try {
		const ban = await guild?.bans.fetch(userId)
		return !!ban
	} catch (error: unknown) {
		return false
	}
}

export async function showConfirmation(
	interaction: ChatInputCommandInteraction,
	callback: (interaction: ModalSubmitInteraction) => Promise<void> | void
) {
	setState(
		'modal-confirm',
		{ callback },
		{
			namespace: interaction.guildId + interaction.user.id
		}
	)
	console.log(`Setting namespace:`, interaction.guildId + interaction.user.id)

	await interaction.showModal({
		title: 'Are you sure?',
		components: [
			{
				type: ComponentType.ActionRow,
				components: [
					{
						type: ComponentType.TextInput,
						label: 'Type "yes" to confirm',
						placeholder: 'yes',
						minLength: 3,
						maxLength: 3,
						customId: TextInputs.Confirm.id,
						style: TextInputStyle.Short
					}
				]
			}
		],
		customId: Modals.Confirm.id
	})
}
