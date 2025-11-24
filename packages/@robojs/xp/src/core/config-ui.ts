import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelSelectMenuBuilder,
	ChannelType,
	MessageActionRowComponentBuilder,
	MessageFlags,
	ModalBuilder,
	RoleSelectMenuBuilder,
	SectionBuilder,
	StringSelectMenuBuilder,
	TextDisplayBuilder,
	TextInputBuilder,
	TextInputStyle
} from 'discord.js'
import type { GuildConfig, RoleReward, RewardsMode } from '../types.js'
import { formatChannel, formatLevel, formatRole } from './utils.js'

const MAX_ENTITY_VALUES = 25

export const COMPONENT_FLAGS = MessageFlags.IsComponentsV2

export type ConfigViewRender = {
	components: Array<ActionRowBuilder<MessageActionRowComponentBuilder> | SectionBuilder>
}

function text(content: string): TextDisplayBuilder {
	return new TextDisplayBuilder().setContent(content)
}

/**
 * Creates a minimal placeholder button accessory for sections.
 * Required by Discord Components v2, but kept visually minimal with a zero-width label.
 *
 * customIdKey is used to ensure uniqueness per section within a message.
 */
function createPlaceholderAccessory(kind: 'heading' | 'summary', customIdKey: string): ButtonBuilder {
	const key = customIdKey.replace(/\s+/g, '-').toLowerCase()

	return new ButtonBuilder()
		.setCustomId(`xp_config:${kind}:${key}`)
		.setLabel('\u200b') // Zero-width space: satisfies length constraint, renders as “empty”
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(true)
}

function headingSection(title: string, body: string): SectionBuilder {
	return new SectionBuilder()
		.addTextDisplayComponents([text(`# ${title}`), text(body)])
		.setButtonAccessory(createPlaceholderAccessory('heading', title))
}

function summarySection(title: string, lines: string[]): SectionBuilder {
	const section = new SectionBuilder().setButtonAccessory(createPlaceholderAccessory('summary', title))
	for (const line of lines) {
		if (line?.trim()) {
			section.addTextDisplayComponents([text(line)])
		}
	}
	return section
}

function buildPaginationHint(items: number): string {
	if (items === 0) {
		return 'None configured'
	}

	return `${items} configured`
}

function buildNoXpSummary(config: GuildConfig): SectionBuilder {
	return summarySection('No-XP Zones', [
		`Roles · ${buildPaginationHint(config.noXpRoleIds.length)}`,
		`Channels · ${buildPaginationHint(config.noXpChannelIds.length)}`
	])
}

function buildRewardsSummary(config: GuildConfig): SectionBuilder {
	const rewards = [...config.roleRewards].sort((a, b) => a.level - b.level)
	const preview = rewards
		.slice(0, 5)
		.map((reward) => `${formatLevel(reward.level)} → ${formatRole(reward.roleId)}`)
	const listValue = rewards.length === 0 ? 'No rewards yet—use the picker below to add one.' : preview.join('\n')

	return summarySection('Role Rewards', [
		`Mode · ${config.rewardsMode === 'stack' ? 'Stack (keep previous roles)' : 'Replace (latest role only)'}`,
		config.removeRewardOnXpLoss ? 'Remove On Loss · Enabled' : 'Remove On Loss · Disabled',
		listValue
	])
}

function buildTextList(items: string[], formatter: (id: string) => string, limit: number): string {
	if (items.length === 0) {
		return 'None configured'
	}

	const preview = items.slice(0, limit).map(formatter)
	const remaining = items.length - preview.length
	return remaining > 0 ? `${preview.join(', ')} … +${remaining} more` : preview.join(', ')
}

function buildNoXpRoleSelectRow(userId: string, roleIds: string[]): ActionRowBuilder<RoleSelectMenuBuilder> {
	const defaults = roleIds.slice(0, MAX_ENTITY_VALUES)
	const select = new RoleSelectMenuBuilder()
		.setCustomId(`xp_config_noxp_roles_select_${userId}`)
		.setPlaceholder('Select roles that should not earn XP')
		.setMinValues(0)
		.setMaxValues(MAX_ENTITY_VALUES)

	if (defaults.length > 0) {
		// Pass array form to avoid variadic usage
		select.setDefaultRoles(defaults)
	}

	return new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents([select])
}

function buildNoXpChannelSelectRow(userId: string, channelIds: string[]): ActionRowBuilder<ChannelSelectMenuBuilder> {
	const defaults = channelIds.slice(0, MAX_ENTITY_VALUES)
	const select = new ChannelSelectMenuBuilder()
		.setCustomId(`xp_config_noxp_channels_select_${userId}`)
		.setPlaceholder('Select channels that should not grant XP')
		.setMinValues(0)
		.setMaxValues(MAX_ENTITY_VALUES)
		.setChannelTypes(
			ChannelType.GuildText,
			ChannelType.GuildAnnouncement,
			ChannelType.AnnouncementThread,
			ChannelType.PublicThread,
			ChannelType.PrivateThread,
			ChannelType.GuildForum
		)

	if (defaults.length > 0) {
		// Pass array form to avoid variadic usage
		select.setDefaultChannels(defaults)
	}

	return new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents([select])
}

function buildRefreshRow(userId: string, scope: ConfigView): ActionRowBuilder<ButtonBuilder> {
	const button = new ButtonBuilder()
		.setCustomId(`xp_config_refresh_${scope}_${userId}`)
		.setEmoji('🔄')
		.setLabel('Refresh')
		.setStyle(ButtonStyle.Secondary)

	if (scope === 'main') {
		button.setCustomId(`xp_config_refresh_main_${userId}`)
	}

	return new ActionRowBuilder<ButtonBuilder>().addComponents([button])
}

function buildNavRow(userId: string, scope: ConfigView): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents([
		new ButtonBuilder()
			.setCustomId(`xp_config_back_main_${userId}`)
			.setLabel('← Back to Menu')
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId(`xp_config_refresh_${scope}_${userId}`)
			.setEmoji('🔄')
			.setLabel('Refresh')
			.setStyle(ButtonStyle.Secondary)
	])
}

function buildCategorySelectRow(userId: string): ActionRowBuilder<StringSelectMenuBuilder> {
	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents([
		new StringSelectMenuBuilder()
			.setCustomId(`xp_config_category_${userId}`)
			.setPlaceholder('Choose what to configure')
			.addOptions([
				{
					label: 'General Settings',
					value: 'general',
					emoji: '⚙️',
					description: 'Cooldown, XP rate, leaderboard'
				},
				{
					label: 'No-XP Zones',
					value: 'noxp',
					emoji: '🚫',
					description: 'Roles and channels blocked from XP'
				},
				{
					label: 'Role Rewards',
					value: 'rewards',
					emoji: '🎁',
					description: 'Roles granted at specific levels'
				}
			])
	])
}

function buildRewardsRolePickerRow(userId: string): ActionRowBuilder<RoleSelectMenuBuilder> {
	return new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents([
		new RoleSelectMenuBuilder()
			.setCustomId(`xp_config_rewards_role_select_${userId}`)
			.setPlaceholder('Pick a role to grant for a level')
			.setMinValues(1)
			.setMaxValues(1)
	])
}

function buildRewardsActionRow(userId: string, hasRewards: boolean): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents([
		new ButtonBuilder()
			.setCustomId(`xp_config_rewards_remove_${userId}`)
			.setLabel('Remove Reward')
			.setEmoji('➖')
			.setDisabled(!hasRewards)
			.setStyle(ButtonStyle.Danger),
		new ButtonBuilder()
			.setCustomId(`xp_config_rewards_view_${userId}`)
			.setLabel('View All')
			.setEmoji('📋')
			.setDisabled(!hasRewards)
			.setStyle(ButtonStyle.Primary)
	])
}

function buildRewardsModeRow(userId: string, mode: RewardsMode, removeOnLoss: boolean): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents([
		new ButtonBuilder()
			.setCustomId(`xp_config_rewards_mode_stack_${userId}`)
			.setLabel('Stack')
			.setDisabled(mode === 'stack')
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId(`xp_config_rewards_mode_replace_${userId}`)
			.setLabel('Replace')
			.setDisabled(mode === 'replace')
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId(`xp_config_rewards_toggle_loss_${userId}`)
			.setLabel(removeOnLoss ? 'Remove On Loss: On' : 'Remove On Loss: Off')
			.setStyle(ButtonStyle.Secondary)
	])
}

export function buildMainMenuView(config: GuildConfig, userId: string): ConfigViewRender {
	return {
		components: [
			headingSection('XP Configuration', 'Select a category below to adjust your leveling system.'),
			summarySection('General', [
				`Cooldown · **${config.cooldownSeconds}s**`,
				`XP Rate · **${config.xpRate.toFixed(2)}x**`,
				config.leaderboard?.public ? 'Leaderboard · Public' : 'Leaderboard · Private'
			]),
			buildNoXpSummary(config),
			buildRewardsSummary(config),
			buildCategorySelectRow(userId),
			buildRefreshRow(userId, 'main')
		]
	}
}

export function buildGeneralSettingsView(config: GuildConfig, userId: string): ConfigViewRender {
	return {
		components: [
			headingSection('General Settings', 'Adjust cooldowns, XP gain rate, and leaderboard visibility.'),
			summarySection('Current Values', [
				`Cooldown · ${config.cooldownSeconds}s`,
				`XP Rate · ${config.xpRate.toFixed(2)}x`,
				config.leaderboard?.public ? 'Leaderboard · Public' : 'Leaderboard · Private'
			]),
			new ActionRowBuilder<ButtonBuilder>().addComponents([
				new ButtonBuilder()
					.setCustomId(`xp_config_edit_cooldown_${userId}`)
					.setLabel('Set Cooldown')
					.setStyle(ButtonStyle.Primary),
				new ButtonBuilder()
					.setCustomId(`xp_config_edit_xprate_${userId}`)
					.setLabel('Set XP Rate')
					.setStyle(ButtonStyle.Primary),
				new ButtonBuilder()
					.setCustomId(`xp_config_toggle_leaderboard_${userId}`)
					.setLabel('Toggle Leaderboard')
					.setStyle(ButtonStyle.Secondary)
			]),
			buildNavRow(userId, 'general')
		]
	}
}

export function buildNoXpZonesView(config: GuildConfig, userId: string): ConfigViewRender {
	const roleList = buildTextList(config.noXpRoleIds, formatRole, 5)
	const channelList = buildTextList(config.noXpChannelIds, formatChannel, 5)

	return {
		components: [
			headingSection('No-XP Zones', 'Roles and channels listed here never earn XP.'),
			summarySection('Roles', [roleList, `Total · ${config.noXpRoleIds.length}`]),
			summarySection('Channels', [channelList, `Total · ${config.noXpChannelIds.length}`]),
			buildNoXpRoleSelectRow(userId, config.noXpRoleIds),
			buildNoXpChannelSelectRow(userId, config.noXpChannelIds),
			buildNavRow(userId, 'noxp')
		]
	}
}

export function buildRoleRewardsView(config: GuildConfig, userId: string): ConfigViewRender {
	return {
		components: [
			headingSection('Role Rewards', 'Grant or remove roles at specific levels.'),
			buildRewardsSummary(config),
			buildRewardsRolePickerRow(userId),
			buildRewardsActionRow(userId, config.roleRewards.length > 0),
			buildRewardsModeRow(userId, config.rewardsMode, config.removeRewardOnXpLoss),
			buildNavRow(userId, 'rewards')
		]
	}
}

export function buildRemoveRewardSelect(
	rewards: RoleReward[],
	userId: string,
	page: number
): ActionRowBuilder<StringSelectMenuBuilder> {
	const start = page * MAX_ENTITY_VALUES
	const paged = [...rewards]
		.sort((a, b) => a.level - b.level)
		.slice(start, start + MAX_ENTITY_VALUES)

	const select = new StringSelectMenuBuilder()
		.setCustomId(`xp_config_rewards_remove_select_${userId}_${page}`)
		.setPlaceholder('Choose a reward level to remove')
		.setMinValues(1)
		.setMaxValues(1)
		.addOptions(
			paged.map((reward) => ({
				label: `Level ${reward.level}`,
				value: String(reward.level),
				description: formatRole(reward.roleId).slice(0, 50)
			}))
		)

	return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents([select])
}

export function buildRemoveRewardPager(
	userId: string,
	page: number,
	totalPages: number
): ActionRowBuilder<ButtonBuilder> {
	const prevDisabled = page <= 0
	const nextDisabled = page >= totalPages - 1

	return new ActionRowBuilder<ButtonBuilder>().addComponents([
		new ButtonBuilder()
			.setCustomId(`xp_config_rewards_remove_prev_${userId}_${page}`)
			.setLabel('Previous')
			.setDisabled(prevDisabled)
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId(`xp_config_rewards_remove_next_${userId}_${page}`)
			.setLabel('Next')
			.setDisabled(nextDisabled)
			.setStyle(ButtonStyle.Secondary)
	])
}

export function buildCooldownModal(currentValue: number): ModalBuilder {
	const input = new TextInputBuilder()
		.setCustomId('cooldown_seconds')
		.setLabel('Cooldown (seconds)')
		.setStyle(TextInputStyle.Short)
		.setPlaceholder('60 (Range: 0-3600)')
		.setValue(String(currentValue))
		.setRequired(true)
		.setMinLength(1)
		.setMaxLength(4)

	return new ModalBuilder()
		.setCustomId('xp_config_modal_cooldown')
		.setTitle('Set XP Cooldown')
		.addComponents([new ActionRowBuilder<TextInputBuilder>().addComponents(input)])
}

export function buildXpRateModal(currentValue: number): ModalBuilder {
	const input = new TextInputBuilder()
		.setCustomId('xp_rate')
		.setLabel('XP Rate Multiplier')
		.setStyle(TextInputStyle.Short)
		.setPlaceholder('1.0 (Range: 0.1-10.0)')
		.setValue(String(currentValue))
		.setRequired(true)
		.setMinLength(1)
		.setMaxLength(5)

	return new ModalBuilder()
		.setCustomId('xp_config_modal_xprate')
		.setTitle('Set XP Rate')
		.addComponents([new ActionRowBuilder<TextInputBuilder>().addComponents(input)])
}

export function buildRewardLevelModal(roleId: string, roleName: string, userId: string): ModalBuilder {
	const levelInput = new TextInputBuilder()
		.setCustomId('reward_level')
		.setLabel('Grant at level')
		.setStyle(TextInputStyle.Short)
		.setPlaceholder('1-1000')
		.setRequired(true)
		.setMinLength(1)
		.setMaxLength(4)

	return new ModalBuilder()
		.setCustomId(`xp_config_modal_reward_${userId}_${roleId}`)
		.setTitle(`Role Reward · ${roleName.slice(0, 45)}`)
		.addComponents([new ActionRowBuilder<TextInputBuilder>().addComponents(levelInput)])
}

type ConfigView = 'main' | 'general' | 'noxp' | 'rewards'
