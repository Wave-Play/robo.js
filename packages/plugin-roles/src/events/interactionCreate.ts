// imports
import { Flashcore, logger } from '@roboplay/robo.js'
import {
	ButtonInteraction,
	ModalSubmitInteraction,
	type Interaction,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
	MessageComponentInteraction,
	RoleSelectMenuInteraction,
	PermissionFlagsBits,
	GuildMemberRoleManager,
	Snowflake,
	StringSelectMenuInteraction
} from 'discord.js'
import { RoleSetupData, RoleSetupDataRole, REGEXPS as regexps } from '../core/types.js'
import { getRolesSetupEmbed, getRolesSetupButtons, printRoleSetup, hasPerm } from '../core/utils.js'

/**
 * Get data from flashcore
 * @param {string} id
 * @returns {RoleSetupData} RoleSetupData
 */
const getRolesSetupInfo = (id: string): Promise<RoleSetupData> => {
	/* eslint-disable no-async-promise-executor */
	return new Promise(async (resolve, reject) => {
		const data = await Flashcore.get(`__roles_Setup@${id}`)
		if (!data) {
			reject()
		} else {
			resolve(data as RoleSetupData)
		}
	})
}

export default async (interaction: Interaction) => {
	/**
	 * Select Role By Member Role embedDescription
	 * @before perms check
	 */
	if (interaction.isStringSelectMenu() && regexps.roleDropperRoleDropdownFromEmbed.test(interaction.customId)) {
		// data
		const i = interaction as StringSelectMenuInteraction
		const roles = i.values
		let message = 'Role(s) Toggled:-'

		// loop
		roles.forEach((role) => {
			const roleID = role.split('@')[1]
			let added = true
			// toggling role
			try {
				if (!(i.member?.roles as GuildMemberRoleManager).cache.has(roleID)) {
					(i.member?.roles as GuildMemberRoleManager).add(roleID as Snowflake)
				} else {
					(i.member?.roles as GuildMemberRoleManager).remove(roleID as Snowflake)
					added = false
				}
				message += `\n- \` ${added ? '+' : '-'} \` <@&${roleID}>`
			} catch {
				message += `\n\n- > Some Internal Error Occured!`
			}
		})

		// result
		await i.reply({
			content: message,
			ephemeral: true
		})
	}

	/**
	 * Perms Check For Further Interactions
	 */
	if (!hasPerm(interaction, PermissionFlagsBits.ManageRoles)) {
		return await (interaction as MessageComponentInteraction)
			.reply({
				content: `You don't have permission to use this.`,
				ephemeral: true
			})
			.catch(logger.error)
	}

	/**
	 * Add Role in Role Setup
	 */
	if (interaction.isRoleSelectMenu() && regexps.roleSetupAddRoleSelector.test(interaction.customId)) {
		const i = interaction as RoleSelectMenuInteraction
		const role = interaction.roles.first()
		const me = await interaction.guild?.members.fetchMe({ force: true })
		const rolesSetupInfo: RoleSetupData = await getRolesSetupInfo(i.customId.split('@')[1])

		// check basic role thingz
		if (role?.managed) {
			return interaction.reply({
				content: 'Integration Rolle',
				ephemeral: true
			})
		}
		if (me && role!.position > me.roles.highest.position) {
			return interaction.reply({
				content: 'Rolle higher',
				ephemeral: true
			})
		}

		// if role exists
		const res = rolesSetupInfo.roles?.filter((i) => i.role == role!.id)

		if (res && res.length > 0) {
			return interaction.reply({ content: "You can't add same role again!", ephemeral: true })
		}

		// all fine show modal
		const customData = {
			label: role?.name,
			id: role?.id
		}
		// short custom id to validate 100 limit
		const addModal = new ModalBuilder()
			.setCustomId(`RSetupM@${rolesSetupInfo.id}@${Buffer.from(JSON.stringify(customData)).toString('utf-8')}`)
			.setTitle('Add Role In Setup!')
		const roleIDInput = new TextInputBuilder()
			.setCustomId('roleDescription')
			.setLabel('Enter The Description For The Role!')
			.setPlaceholder('For Example: 739454321661313000')
			.setMaxLength(40)
			.setValue(`Select @${role?.name} Role Here!`)
			.setRequired(false)
			.setStyle(TextInputStyle.Paragraph)
		const roleEmote = new TextInputBuilder()
			.setCustomId('roleEmote')
			.setLabel('Enter Single Emote for Role!')
			.setPlaceholder('For Example: 🤡 (optional)')
			.setRequired(false)
			.setStyle(TextInputStyle.Short)

		addModal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(roleEmote))
		addModal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(roleIDInput))
		await i.showModal(addModal)
	}
	/**
	 * Delete Role in Role Setup
	 */
	if (interaction.isRoleSelectMenu() && regexps.roleSetupDeleteRoleSelector.test(interaction.customId)) {
		const i = interaction as RoleSelectMenuInteraction
		const id = i.customId.split('@')[1]
		const rolesSetupInfo: RoleSetupData = await getRolesSetupInfo(id)
		const roles = interaction.roles
		const [x, y, z] = getRolesSetupButtons(id, rolesSetupInfo)

		// check
		roles.forEach((x) => {
			rolesSetupInfo.roles?.forEach((y, i) => {
				if (y.role.toString() == x.id.toString()) {
					delete rolesSetupInfo.roles![i]
				}
			})
		})

		// set
		await Flashcore.set(`__roles_Setup@${id}`, rolesSetupInfo)
		interaction.message
			?.edit({
				embeds: [getRolesSetupEmbed(rolesSetupInfo)],
				components: [x, y, z]
			})
			.then(async () => {
				return await interaction.reply({
					content: 'Selected Role(s) Deleted Fully!',
					ephemeral: true
				})
			})
	}

	/**
	 * @handler Buttons
	 */
	if (interaction.isButton()) {
		// Btn Info
		const btn = interaction as ButtonInteraction
		const btnID = btn.customId.split('@')[1]

		/**
		 * Edit Embed Button To Show Modal In RoleSetup
		 */
		if (regexps.editEmbedInRoleSetupButton.test(btn.customId)) {
			// Get Data
			const rolesSetupInfo: RoleSetupData = await getRolesSetupInfo(btnID)
			const editEmbedModal = new ModalBuilder()
				.setCustomId(`editEmbedInRoleSetupModal@${rolesSetupInfo.id}`)
				.setTitle('Edit Role Selector Embed!')

			// input fields
			const titleInput = new TextInputBuilder()
				.setCustomId('embedTitle')
				.setLabel('Enter Title For Embed')
				.setPlaceholder('For Example: Select Roles!')
				.setMaxLength(200)
				.setValue(rolesSetupInfo.title)
				.setMinLength(1)
				.setStyle(TextInputStyle.Short)
			const descriptionInput = new TextInputBuilder()
				.setCustomId('embedDescription')
				.setLabel('Enter Description For Embed')
				.setPlaceholder('For Example: Just Chose Roles From Dropdown!')
				.setMaxLength(2000)
				.setValue(rolesSetupInfo.description)
				.setStyle(TextInputStyle.Paragraph)
			const colorInput = new TextInputBuilder()
				.setCustomId('embedColor')
				.setLabel('Enter Color For Embed')
				.setPlaceholder('For Example: #ffa500')
				.setMaxLength(10)
				.setMinLength(6)
				.setValue(rolesSetupInfo.color ?? 'Blurple')
				.setMinLength(3)
				.setStyle(TextInputStyle.Short)

			// show modal
			editEmbedModal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput))
			editEmbedModal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput))
			editEmbedModal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(colorInput))
			await btn.showModal(editEmbedModal)
		}

		/**
		 * Print Setup Button
		 */
		if (regexps.printSetupBtn.test(btn.customId)) {
			// Get Data
			const rolesSetupInfo: RoleSetupData = await getRolesSetupInfo(btnID)

			// print
			await interaction.channel?.send(printRoleSetup(rolesSetupInfo))

			// cleanup
			await Flashcore.delete(`__roles_Setup@${btnID}`)

			// try deleting message
			await interaction.message.delete().catch(console.error)

			// return
			return
		}
	}

	/**
	 * @handler Modals
	 */
	if (interaction.isModalSubmit()) {
		// Modal Info
		const modal = interaction as ModalSubmitInteraction
		const modalID = modal.customId.split('@')[1]

		/**
		 * Add Role With Data Modal
		 */
		if (regexps.roleSetupAddRoleSelectedModal.test(modal.customId)) {
			// vars
			const roleDescription = modal.fields.getTextInputValue('roleDescription').trim()
			const roleEmote = modal.fields.getTextInputValue('roleEmote').trim()
			const rolesSetupInfo: RoleSetupData = await getRolesSetupInfo(modalID)
			const [x, y, z] = getRolesSetupButtons(modalID, rolesSetupInfo)

			// extract data
			const data = JSON.parse(modal.customId.split('@')[2])
			const roleName = data.label
			const roleID = data.id
			try {
				const newRoleData: RoleSetupDataRole = {
					label: roleName,
					role: roleID,
					description: roleDescription.trim().length > 1 ? roleDescription.trim() : undefined,
					emote: roleEmote
				}
				if (rolesSetupInfo.roles) {
					rolesSetupInfo.roles.push(newRoleData)
				} else {
					rolesSetupInfo.roles = [newRoleData]
				}
				await Flashcore.set(`__roles_Setup@${modalID}`, rolesSetupInfo)
				interaction.message
					?.edit({
						embeds: [getRolesSetupEmbed(rolesSetupInfo)],
						components: [x, y, z]
					})
					.then(async () => {
						await interaction.reply({
							content: 'Role Added',
							ephemeral: true
						})
					})
			} catch {
				return interaction.reply({
					content: '💥 Internal error: Something went wrong on our end. Please try again later!',
					ephemeral: true
				})
			}
		}

		/**
		 * Edit Embed Modal
		 */
		if (regexps.editEmbedInRoleSetupModal.test(modal.customId)) {
			// vars
			const rolesSetupInfo: RoleSetupData = await getRolesSetupInfo(modalID)
			const [x, y, z] = getRolesSetupButtons(modalID, rolesSetupInfo)
			const embedTitle = modal.fields.getTextInputValue('embedTitle').trim()
			const embedDescription = modal.fields.getTextInputValue('embedDescription').trim()
			const embedColor = modal.fields.getTextInputValue('embedColor').trim()

			// edit data
			rolesSetupInfo.title = embedTitle
			rolesSetupInfo.description = embedDescription.trim()
			rolesSetupInfo.color = `#${embedColor.trim().replaceAll('#', '')}`

			try {
				await interaction.message
					?.edit({
						embeds: [getRolesSetupEmbed(rolesSetupInfo)],
						components: [x, y, z]
					})
					.then(async () => {
						await Flashcore.set(`__roles_Setup@${modalID}`, rolesSetupInfo)
						await interaction.reply({
							content: 'Embed Updated!',
							ephemeral: true
						})
					})
			} catch {
				return interaction.reply({
					content: '💥 Internal error: Something went wrong on our end. Please try again later!'
				})
			}
		}
	}
}
