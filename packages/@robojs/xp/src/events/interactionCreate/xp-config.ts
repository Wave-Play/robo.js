import { ChannelType, MessageFlags } from 'discord.js'
import type {
	ButtonInteraction,
	ChannelSelectMenuInteraction,
	ChatInputCommandInteraction,
	Interaction,
	MessagePayload,
	ModalSubmitInteraction,
	RoleSelectMenuInteraction,
	StringSelectMenuInteraction
} from 'discord.js'
import type { CommandResult } from 'robo.js'
import { getConfig, setConfig } from '../../config.js'
import { xpLogger } from '../../core/logger.js'
import {
	COMPONENT_FLAGS,
	buildCooldownModal,
	buildGeneralSettingsView,
	buildMainMenuView,
	buildNoXpZonesView,
	buildRewardLevelModal,
	buildRoleRewardsView,
	buildXpRateModal
} from '../../core/config-ui.js'
import {
	createErrorEmbed,
	createPermissionError,
	createSuccessEmbed,
	formatLevel,
	formatRole,
	getEmbedColor,
	hasAdminPermission,
	requireGuild,
	safeReply
} from '../../core/utils.js'
import {
	buildRewardsEmbed,
	buildRewardsPaginationButtons,
	calculateTotalPages
} from '../../core/rewards-ui.js'
import type { GuildConfig } from '../../types.js'

type ConfigView = 'main' | 'general' | 'noxp' | 'rewards'

const CONFIG_NAMESPACE = 'xp_config'
const REMOVE_REWARD_PAGE_SIZE = 25

export default async function handleXpConfig(interaction: Interaction): Promise<void> {
	if (interaction.isModalSubmit()) {
		if (!interaction.customId.startsWith(CONFIG_NAMESPACE)) {
			return
		}

		await handleModal(interaction)
		return
	}

	if (
		!interaction.isButton() &&
		!interaction.isStringSelectMenu() &&
		!interaction.isRoleSelectMenu() &&
		!interaction.isChannelSelectMenu()
	) {
		return
	}

	if (!interaction.customId.startsWith(CONFIG_NAMESPACE)) {
		return
	}

	const parsed = parseCustomId(interaction.customId, interaction.user.id)
	if (!parsed) {
		return
	}

	if (parsed.userMismatch) {
	await safeReply(interaction, {
		content: 'This configuration panel belongs to someone else. Run `/xp config` to start your own session.',
		flags: MessageFlags.Ephemeral
	})
		return
	}

	const guildCheck = requireGuild(interaction)
	if (typeof guildCheck === 'string') {
	await safeReply(interaction, {
		embeds: [createErrorEmbed('Server Only', guildCheck)],
		flags: MessageFlags.Ephemeral
	})
		return
	}

	if (!hasAdminPermission(interaction as unknown as ChatInputCommandInteraction)) {
		const permissionError = createPermissionError() as Exclude<CommandResult, string | void | MessagePayload>
		await safeReply(interaction, permissionError)
		return
	}

	const { guildId } = guildCheck

	if (parsed.actionParts[0] === 'refresh') {
		if (interaction.isButton()) {
			const view = getViewFromActionPart(parsed.actionParts[1])
			await handleRefresh(interaction, guildId, view)
		}
		return
	}

	try {
		switch (parsed.action) {
			case 'category':
				if (interaction.isStringSelectMenu()) {
					await handleCategorySelect(interaction, guildId)
				}
				break
			case 'back_main':
				if (interaction.isButton()) {
					await handleBackToMain(interaction, guildId)
				}
				break
			case 'edit_cooldown':
				if (interaction.isButton()) {
					await handleEditCooldown(interaction, guildId)
				}
				break
			case 'edit_xprate':
				if (interaction.isButton()) {
					await handleEditXpRate(interaction, guildId)
				}
				break
			case 'toggle_leaderboard':
				if (interaction.isButton()) {
					await handleToggleLeaderboard(interaction, guildId)
				}
				break
		case 'noxp_roles_select':
			if (interaction.isRoleSelectMenu()) {
				await handleNoXpRoleSelect(interaction, guildId)
			}
			break
		case 'noxp_channels_select':
			if (interaction.isChannelSelectMenu()) {
				await handleNoXpChannelSelect(interaction, guildId)
			}
			break
		case 'rewards_role_select':
			if (interaction.isRoleSelectMenu()) {
				await handleRewardsRoleSelect(interaction, guildId)
			}
			break
			case 'rewards_remove':
				if (interaction.isButton()) {
					await handleRemoveReward(interaction, guildId)
				}
				break
			case 'rewards_view':
				if (interaction.isButton()) {
					await handleViewRewards(interaction, guildId)
				}
				break
			case 'rewards_mode_stack':
			case 'rewards_mode_replace':
				if (interaction.isButton()) {
					const desiredMode = parsed.action.endsWith('stack') ? 'stack' : 'replace'
					await handleRewardsMode(interaction, guildId, desiredMode)
				}
				break
			case 'rewards_toggle_loss':
				if (interaction.isButton()) {
					await handleToggleRemoveOnLoss(interaction, guildId)
				}
				break
			case 'rewards_remove_select':
				if (interaction.isStringSelectMenu()) {
					await handleRemoveRewardSelect(interaction, guildId)
				}
				break
			case 'rewards_remove_prev':
			case 'rewards_remove_next':
				if (interaction.isButton()) {
					const currentPage = parsePageArgument(parsed.args[0])
					const direction = parsed.action.endsWith('prev') ? -1 : 1
					await handleRemoveRewardPage(interaction, guildId, currentPage, direction)
				}
				break
			default:
				break
		}
	} catch (error) {
		xpLogger.error('Error handling XP config interaction:', error)
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Error', 'Something went wrong while updating the XP configuration.')],
			flags: MessageFlags.Ephemeral
		})
	}
}

async function handleCategorySelect(interaction: StringSelectMenuInteraction, guildId: string) {
	const [selection] = interaction.values
	const guildConfig = await getConfig(guildId)
	const view = getViewFromActionPart(selection)
	const payload = buildViewPayload(view, guildConfig, interaction.user.id)

	await interaction.update({ components: payload.components, flags: COMPONENT_FLAGS })
}

async function handleBackToMain(interaction: ButtonInteraction, guildId: string) {
	const guildConfig = await getConfig(guildId)
	const payload = buildViewPayload('main', guildConfig, interaction.user.id)
	await interaction.update({ components: payload.components, flags: COMPONENT_FLAGS })
}

async function handleRefresh(interaction: ButtonInteraction, guildId: string, view: ConfigView) {
	const guildConfig = await getConfig(guildId)
	const payload = buildViewPayload(view, guildConfig, interaction.user.id)

	await interaction.update({ components: payload.components, flags: COMPONENT_FLAGS })
}

async function handleEditCooldown(interaction: ButtonInteraction, guildId: string) {
	const guildConfig = await getConfig(guildId)
	await interaction.showModal(buildCooldownModal(guildConfig.cooldownSeconds))
}

async function handleEditXpRate(interaction: ButtonInteraction, guildId: string) {
	const guildConfig = await getConfig(guildId)
	await interaction.showModal(buildXpRateModal(guildConfig.xpRate))
}

async function handleToggleLeaderboard(interaction: ButtonInteraction, guildId: string) {
	const guildConfig = await getConfig(guildId)
	const updatedConfig = await setConfig(guildId, {
		leaderboard: { public: !guildConfig.leaderboard.public }
	})
	const payload = buildViewPayload('general', updatedConfig, interaction.user.id)

	await interaction.update({ components: payload.components, flags: COMPONENT_FLAGS })
}

async function handleRemoveReward(interaction: ButtonInteraction, guildId: string) {
	const guildConfig = await getConfig(guildId)
	if (guildConfig.roleRewards.length === 0) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('No Rewards', 'There are no role rewards to remove yet.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	// Legacy handler kept for safety; in the new UX removal is inline,
	// so this simply refreshes the rewards view.
	const payload = buildViewPayload('rewards', guildConfig, interaction.user.id)
	await interaction.update({ components: payload.components, flags: COMPONENT_FLAGS })
}

async function handleViewRewards(interaction: ButtonInteraction, guildId: string) {
	const guildConfig = await getConfig(guildId)
	const rewards = [...guildConfig.roleRewards].sort((a, b) => a.level - b.level)
	const totalPages = Math.max(calculateTotalPages(rewards.length), 1)
	const embed = buildRewardsEmbed(
		rewards,
		0,
		totalPages,
		guildConfig.rewardsMode,
		guildConfig.removeRewardOnXpLoss,
		getEmbedColor(guildConfig)
	)
	const paginationRow = buildRewardsPaginationButtons(0, totalPages, interaction.user.id)

	await interaction.reply({
		embeds: [embed],
		components: paginationRow ? [paginationRow] : [],
		flags: MessageFlags.Ephemeral
	})
}

async function handleRewardsMode(interaction: ButtonInteraction, guildId: string, desiredMode: 'stack' | 'replace') {
	const updatedConfig = await setConfig(guildId, {
		rewardsMode: desiredMode
	})

	const payload = buildViewPayload('rewards', updatedConfig, interaction.user.id)
	await interaction.update({ components: payload.components, flags: COMPONENT_FLAGS })
}

async function handleToggleRemoveOnLoss(interaction: ButtonInteraction, guildId: string) {
	const guildConfig = await getConfig(guildId)
	const updatedConfig = await setConfig(guildId, {
		removeRewardOnXpLoss: !guildConfig.removeRewardOnXpLoss
	})

	const payload = buildViewPayload('rewards', updatedConfig, interaction.user.id)
	await interaction.update({ components: payload.components, flags: COMPONENT_FLAGS })
}

async function handleRemoveRewardSelect(interaction: StringSelectMenuInteraction, guildId: string) {
	const [value] = interaction.values
	const level = Number.parseInt(value, 10)
	if (!Number.isInteger(level)) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Invalid Level', 'Please select a valid reward level.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	const guildConfig = await getConfig(guildId)
	const existing = guildConfig.roleRewards.find((reward) => reward.level === level)
	if (!existing) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Not Found', `No reward is configured at level ${level}.`)],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	const updatedConfig = await setConfig(guildId, {
		roleRewards: guildConfig.roleRewards.filter((reward) => reward.level !== level)
	})

	const payload = buildViewPayload('rewards', updatedConfig, interaction.user.id)
	await interaction.update({ components: payload.components, flags: COMPONENT_FLAGS })

	await interaction.followUp({
		embeds: [
			createSuccessEmbed('Role Reward Removed', `${formatRole(existing.roleId)} is no longer awarded at ${formatLevel(level)}.`)
		],
		flags: MessageFlags.Ephemeral
	})
}

async function handleRemoveRewardPage(
	interaction: ButtonInteraction,
	guildId: string,
	currentPage: number,
	direction: -1 | 1
) {
	const guildConfig = await getConfig(guildId)
	if (guildConfig.roleRewards.length === 0) {
		const payload = buildViewPayload('rewards', guildConfig, interaction.user.id)
		await interaction.update({ components: payload.components, flags: COMPONENT_FLAGS })
		return
	}

	const totalPages = Math.max(Math.ceil(guildConfig.roleRewards.length / REMOVE_REWARD_PAGE_SIZE), 1)
	const targetPage = clampRemoveRewardPage(currentPage + direction, totalPages)
	await renderRewardRemoval(interaction, guildConfig, interaction.user.id, targetPage)
}

async function handleNoXpRoleSelect(interaction: RoleSelectMenuInteraction, guildId: string) {
	const selectedRoles = Array.from(new Set(interaction.values))
	const guild = interaction.guild
	if (!guild) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Error', 'Unable to resolve guild context for this interaction.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	for (const roleId of selectedRoles) {
		const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null))
		if (!role) {
			await safeReply(interaction, {
				embeds: [createErrorEmbed('Role Not Found', 'One of the selected roles no longer exists.')],
				flags: MessageFlags.Ephemeral
			})
			return
		}
		if ('managed' in role && role.managed) {
			await safeReply(interaction, {
				embeds: [createErrorEmbed('Invalid Role', 'Managed roles cannot be blocked from earning XP.')],
				flags: MessageFlags.Ephemeral
			})
			return
		}
		if (role.id === guildId) {
			await safeReply(interaction, {
				embeds: [createErrorEmbed('Invalid Role', 'The @everyone role cannot be used here.')],
				flags: MessageFlags.Ephemeral
			})
			return
		}
	}

	const updatedConfig = await setConfig(guildId, { noXpRoleIds: selectedRoles })
	const payload = buildViewPayload('noxp', updatedConfig, interaction.user.id)

	await interaction.update({ components: payload.components, flags: COMPONENT_FLAGS })
	await interaction.followUp({
		embeds: [
			createSuccessEmbed(
				'No-XP Roles Updated',
				selectedRoles.length === 0
					? 'No roles are currently blocked from XP.'
					: `${selectedRoles.length} role${selectedRoles.length === 1 ? '' : 's'} will no longer earn XP.`
			)
		],
		flags: MessageFlags.Ephemeral
	})
}

async function handleNoXpChannelSelect(interaction: ChannelSelectMenuInteraction, guildId: string) {
	const selectedChannels = Array.from(new Set(interaction.values))
	const guild = interaction.guild
	if (!guild) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Error', 'Unable to resolve guild context for this interaction.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	for (const channelId of selectedChannels) {
		const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null))
		const isTextBasedGuildChannel = channel && 'isTextBased' in channel && channel.isTextBased()
		const isGuildForum = channel?.type === ChannelType.GuildForum

		if (!channel || (!isTextBasedGuildChannel && !isGuildForum)) {
			await safeReply(interaction, {
				embeds: [createErrorEmbed('Invalid Channel', 'Please choose a text-based channel in this server.')],
				flags: MessageFlags.Ephemeral
			})
			return
		}
	}

	const updatedConfig = await setConfig(guildId, { noXpChannelIds: selectedChannels })
	const payload = buildViewPayload('noxp', updatedConfig, interaction.user.id)
	await interaction.update({ components: payload.components, flags: COMPONENT_FLAGS })
	await interaction.followUp({
		embeds: [
			createSuccessEmbed(
				'No-XP Channels Updated',
				selectedChannels.length === 0
					? 'No channels are currently blocked from XP.'
					: `${selectedChannels.length} channel${selectedChannels.length === 1 ? '' : 's'} will no longer grant XP.`
			)
		],
		flags: MessageFlags.Ephemeral
	})
}

async function handleRewardsRoleSelect(interaction: RoleSelectMenuInteraction, guildId: string) {
	const [roleId] = interaction.values
	if (!roleId) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('No Role Selected', 'Pick a role to create a reward.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	const guild = interaction.guild
	if (!guild) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Error', 'Unable to resolve guild context for this interaction.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null))
	if (!role) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Role Not Found', 'Could not find the selected role in this server.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}
	if ('managed' in role && role.managed) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Invalid Role', 'Managed roles cannot be used as rewards.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}
	if (role.id === guildId) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Invalid Role', 'The @everyone role cannot be used as a reward.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	await interaction.showModal(buildRewardLevelModal(roleId, role.name ?? 'Role', interaction.user.id))
}

async function handleModal(interaction: ModalSubmitInteraction) {
	const parts = interaction.customId.split('_')
	if (parts[0] !== 'xp' || parts[1] !== 'config' || parts[2] !== 'modal') {
		return
	}

	const guildCheck = requireGuild(interaction)
	if (typeof guildCheck === 'string') {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Server Only', guildCheck)],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	if (!hasAdminPermission(interaction as unknown as ChatInputCommandInteraction)) {
		const permissionError = createPermissionError() as Exclude<CommandResult, string | void | MessagePayload>
		await safeReply(interaction, permissionError)
		return
	}

	const { guildId } = guildCheck

	try {
		switch (parts[3]) {
			case 'cooldown':
				await handleCooldownModal(interaction, guildId)
				break
			case 'xprate':
				await handleXpRateModal(interaction, guildId)
				break
		case 'reward':
			await handleRewardModal(interaction, guildId, parts[4], parts[5])
				break
			default:
				break
		}
	} catch (error) {
		xpLogger.error('Error handling XP config modal:', error)
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Error', 'Something went wrong while saving your changes.')],
			flags: MessageFlags.Ephemeral
		})
	}
}

async function handleCooldownModal(interaction: ModalSubmitInteraction, guildId: string) {
	const rawValue = interaction.fields.getTextInputValue('cooldown_seconds')
	const value = Number.parseInt(rawValue, 10)

	if (!Number.isInteger(value) || value < 0 || value > 3600) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Invalid Cooldown', 'Cooldown must be between 0 and 3600 seconds.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	const updatedConfig = await setConfig(guildId, { cooldownSeconds: value })
	const alreadyReplied = await refreshMessageAfterModal(interaction, 'general', updatedConfig)
	const respond = alreadyReplied ? interaction.followUp.bind(interaction) : interaction.reply.bind(interaction)

	await respond({
		embeds: [createSuccessEmbed('Cooldown Updated', `XP cooldown is now set to ${value} second${value === 1 ? '' : 's'}.`)],
		flags: MessageFlags.Ephemeral
	})
}

async function handleXpRateModal(interaction: ModalSubmitInteraction, guildId: string) {
	const rawValue = interaction.fields.getTextInputValue('xp_rate')
	const value = Number.parseFloat(rawValue)

	if (!Number.isFinite(value) || value < 0.1 || value > 10) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Invalid XP Rate', 'XP rate must be between 0.1x and 10x.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	const updatedConfig = await setConfig(guildId, { xpRate: Number(value.toFixed(2)) })
	const alreadyReplied = await refreshMessageAfterModal(interaction, 'general', updatedConfig)
	const respond = alreadyReplied ? interaction.followUp.bind(interaction) : interaction.reply.bind(interaction)

	await respond({
		embeds: [createSuccessEmbed('XP Rate Updated', `XP rate multiplier set to ${value}x.`)],
		flags: MessageFlags.Ephemeral
	})
}

async function handleRewardModal(
	interaction: ModalSubmitInteraction,
	guildId: string,
	targetUserId?: string,
	roleId?: string
) {
	if (!roleId) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Missing Context', 'Role information was not found for this reward.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	if (targetUserId && targetUserId !== interaction.user.id) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Expired Prompt', 'Please start a new reward flow from `/xp config`.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	const levelInput = interaction.fields.getTextInputValue('reward_level')
	const level = Number.parseInt(levelInput, 10)
	if (!Number.isInteger(level) || level < 1 || level > 1000) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Invalid Level', 'Level must be between 1 and 1000.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	const guild = interaction.guild
	if (!guild) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Error', 'Unable to resolve guild context for this interaction.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null))
	if (!role) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Role Not Found', 'Could not find that role in this server.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	if ('managed' in role && role.managed) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Invalid Role', 'Managed roles cannot be used as rewards.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	if (role.id === guildId) {
		await safeReply(interaction, {
			embeds: [createErrorEmbed('Invalid Role', 'The @everyone role cannot be used as a reward.')],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	const guildConfig = await getConfig(guildId)
	if (guildConfig.roleRewards.some((reward) => reward.level === level)) {
		await safeReply(interaction, {
			embeds: [
				createErrorEmbed(
					'Level Already Configured',
					`${formatLevel(level)} already has a role reward. Remove it first or pick another level.`
				)
			],
			flags: MessageFlags.Ephemeral
		})
		return
	}

	const updatedConfig = await setConfig(guildId, {
		roleRewards: [...guildConfig.roleRewards, { level, roleId }].sort((a, b) => a.level - b.level)
	})
	const alreadyReplied = await refreshMessageAfterModal(interaction, 'rewards', updatedConfig)
	const respond = alreadyReplied ? interaction.followUp.bind(interaction) : interaction.reply.bind(interaction)

	await respond({
		embeds: [
			createSuccessEmbed('Role Reward Added', `${formatRole(roleId)} will be granted at ${formatLevel(level)}.`)
		],
		flags: MessageFlags.Ephemeral
	})
}

type ParsedCustomId = {
	action: string
	actionParts: string[]
	args: string[]
	userMismatch: boolean
}

function parseCustomId(customId: string, userId: string): ParsedCustomId | null {
	const parts = customId.split('_')
	if (parts[0] !== 'xp' || parts[1] !== 'config') {
		return null
	}

	const userIndex = parts.findIndex((part) => part === userId)
	if (userIndex === -1) {
		return { action: '', actionParts: [], args: [], userMismatch: true }
	}

	const actionParts = parts.slice(2, userIndex)
	const action = actionParts.join('_')
	const args = parts.slice(userIndex + 1)
	return { action, actionParts, args, userMismatch: false }
}

function buildViewPayload(view: ConfigView, config: GuildConfig, userId: string) {
	switch (view) {
		case 'general':
			return buildGeneralSettingsView(config, userId)
		case 'noxp':
			return buildNoXpZonesView(config, userId)
		case 'rewards':
			return buildRoleRewardsView(config, userId)
		default:
			return buildMainMenuView(config, userId)
	}
}

async function refreshMessageAfterModal(
	interaction: ModalSubmitInteraction,
	view: ConfigView,
	updatedConfig: GuildConfig
): Promise<boolean> {
	const message = interaction.message
	const payload = buildViewPayload(view, updatedConfig, interaction.user.id)

	const isEphemeral = Boolean(message?.flags?.has(MessageFlags.Ephemeral))

	if (!message || isEphemeral) {
		await interaction.reply({
			components: payload.components,
			flags: COMPONENT_FLAGS | MessageFlags.Ephemeral
		})
		return true
	}

	await message.edit({ components: payload.components, flags: COMPONENT_FLAGS })
	return false
}

async function renderRewardRemoval(
	interaction: ButtonInteraction,
	guildConfig: GuildConfig,
	userId: string,
	page: number
) {
	const totalPages = Math.max(Math.ceil(guildConfig.roleRewards.length / REMOVE_REWARD_PAGE_SIZE), 1)
	const currentPage = clampRemoveRewardPage(page, totalPages)
	const layout = buildRoleRewardsView(guildConfig, userId, currentPage)

	await interaction.update({
		components: layout.components,
		flags: COMPONENT_FLAGS
	})
}

function clampRemoveRewardPage(page: number, totalPages: number): number {
	const maxPage = Math.max(0, totalPages - 1)
	return Math.max(0, Math.min(maxPage, page))
}

function parsePageArgument(rawValue?: string): number {
	const parsed = Number.parseInt(rawValue ?? '0', 10)
	return Number.isNaN(parsed) ? 0 : parsed
}

function getViewFromActionPart(part?: string): ConfigView {
	switch (part) {
		case 'general':
			return 'general'
		case 'noxp':
			return 'noxp'
		case 'rewards':
			return 'rewards'
		default:
			return 'main'
	}
}
