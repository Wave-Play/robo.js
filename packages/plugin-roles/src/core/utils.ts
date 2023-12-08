// imports
import {
	ActionRowBuilder,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	BaseMessageOptions,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	RoleSelectMenuBuilder,
	BaseInteraction,
	PermissionResolvable,
	ComponentEmojiResolvable
} from 'discord.js'
import { RoleSetupData } from './types'

/**
 * Embed During Active Role Setup Creation
 */
export const getRolesSetupEmbed = (data: RoleSetupData) => {
	const introEmbed = new EmbedBuilder()
		.setTitle(data.title ?? 'Role Selector!')
		.setColor(data.color ? `#${data.color.replaceAll('#', '').toString()}` : 'Blurple')
		.setDescription(data.description ?? 'Select Roles From Dropdown Below!')
		.setTimestamp()
	data.roles?.forEach((x, i) =>
		introEmbed.addFields({
			name: `Roles Added To Dropper #${i + 1}`,
			value: `${x.emote ?? `#${i + 1}`} - **<@&${x.role}>** - ${x.description ?? `No Description!`}`
		})
	)
	return introEmbed
}
/**
 * Buttons followed by Embed During Active Role Setup Creation
 */
export const getRolesSetupButtons = (ID: string, data: RoleSetupData) => {
	// Buttons
	const disabled = false //data.roles ? data.roles.length == 0 : true
	const editBtn = new ButtonBuilder()
		.setCustomId(`editEmbedInRoleSetupButton@${ID}`)
		.setLabel('Edit Embed')
		.setEmoji('✍')
		.setStyle(ButtonStyle.Secondary)
	const printBtn = new ButtonBuilder()
		.setCustomId(`printSetupBtn@${ID}`)
		.setEmoji('👣')
		.setLabel('Print Setup')
		.setDisabled(disabled)
		.setStyle(ButtonStyle.Success)
	// intro row
	const introRow = new ActionRowBuilder<ButtonBuilder>().addComponents(printBtn, editBtn)
	const introRow2 = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
		new RoleSelectMenuBuilder().setPlaceholder('Select Role To Add!').setCustomId(`roleSetupAddRoleSelector@${ID}`)
	)
	const introRow3 = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
		new RoleSelectMenuBuilder()
			.setPlaceholder('Select Role(s) To Remove!')
			.setCustomId(`roleSetupDeleteRoleSelector@${ID}`)
			.setMaxValues(25)
	)
	return [introRow, introRow2, introRow3]
}

/**
 * Clean up and print func, final step for setup
 */
export const printRoleSetup = (data: RoleSetupData): BaseMessageOptions => {
	const embed = new EmbedBuilder()
		.setTitle(data.title ?? 'Role Selector!')
		.setColor(data.color ? `#${data.color.replaceAll('#', '').toString()}` : 'Blurple')
		.setDescription(data.description ?? 'Select Roles From Dropdown Below!')

	const rolesDropdownOptions: StringSelectMenuOptionBuilder[] = []

	data.roles?.forEach((x) => {
		const DATA = new StringSelectMenuOptionBuilder().setLabel(x.label).setValue(`role_Setup_roleDropper_ROLE@${x.role}`)
		if (x.description && x.description.trim().length > 0) DATA.setDescription(x.description)
		if (x.emote) DATA.setEmoji(x.emote as ComponentEmojiResolvable)
		rolesDropdownOptions.push(DATA)
	})

	// component group
	const rolesDropdown = new StringSelectMenuBuilder()
		.setCustomId(`role_Setup_roleDropper@${data.id}`)
		.setPlaceholder('Select Your Role Here!')
		.setMaxValues(25)
		.addOptions(rolesDropdownOptions)
	const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(rolesDropdown)

	return {
		embeds: [embed],
		components: [row]
	}
}

/**
 * Check perms helper
 */
export function hasPerm(interaction: BaseInteraction, permission: PermissionResolvable): boolean {
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
