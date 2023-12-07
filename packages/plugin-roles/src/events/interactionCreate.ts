// imports
import { Flashcore } from '@roboplay/robo.js'
import {
	ButtonInteraction,
	ModalSubmitInteraction,
	type Interaction,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	ActionRowBuilder,
	Snowflake,
	RoleSelectMenuInteraction,
	Role
} from 'discord.js'
import { RoleSetupData, RoleSetupDataRole, REGEXPS as regexps } from '../core/types.js'
import { getRolesSetupEmbed, getRolesSetupButtons, printRoleSetup } from '../core/utils.js'

/**
 * Get data from flashcore
 * @param {Interaction} i
 * @param {string} id
 * @returns {RoleSetupData} RoleSetupData
 */
const getRolesSetupInfo = (i: Interaction, id: string): any => {
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
	 * Add Role in Role Setup
	 */
	if (interaction.isRoleSelectMenu() && regexps.roleSetupAddRoleSelector.test(interaction.customId)) {
		const i = interaction as RoleSelectMenuInteraction
		const role = interaction.roles.first()
		const me = await interaction.guild?.members.fetchMe({ force: true })
		const rolesSetupInfo: RoleSetupData = await getRolesSetupInfo(i, i.customId.split('@')[1])

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
		if (rolesSetupInfo.roles?.filter((i) => i.role == role!.id)) {
			return interaction.reply({ content: "You can't add same role again!" })
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
		const rolesSetupInfo: RoleSetupData = await getRolesSetupInfo(i, id)
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
	 * Select Role By Member Role Embed
	 */
	if (interaction.isRoleSelectMenu() && regexps.roleDropperRoleSelectFromEmbed.test(interaction.customId)) {
		const i = interaction as RoleSelectMenuInteraction
		const roleID = interaction.customId.split('@')[1]
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
			const rolesSetupInfo: RoleSetupData = await getRolesSetupInfo(btn, btnID)
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

			// show modal
			editEmbedModal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput))
			editEmbedModal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(descriptionInput))
			await btn.showModal(editEmbedModal)
		}

		/**
		 * Print Setup Button
		 */
		if (regexps.printSetupBtn.test(btn.customId)) {
			// Get Data
			const rolesSetupInfo: RoleSetupData = await getRolesSetupInfo(btn, btnID)

			// print
			await interaction.channel?.send(printRoleSetup(rolesSetupInfo)).then(async () => {
				await interaction.reply({
					content: 'Success'
				})
			})

			// cleanup
			return await Flashcore.delete(`__roles_Setup@${btnID}`)
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
			const rolesSetupInfo: RoleSetupData = await getRolesSetupInfo(modal, modalID)
			const [x, y, z] = getRolesSetupButtons(modalID, rolesSetupInfo)

			// extract data
			const data = JSON.parse(modal.customId.split('@')[2])
			const roleName = data.label
			const roleID = data.id
			try {
				let newRoleData: RoleSetupDataRole = {
					label: roleName,
					role: roleID,
					description: roleDescription.trim().length > 1 ? roleDescription.trim() : undefined,
					emote: interaction.guild?.emojis.resolveIdentifier(roleEmote) ?? undefined
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
					content: 'Internal Error',
					ephemeral: true
				})
			}
		}

		/**
		 * Edit Embed Modal
		 */
		if (regexps.editEmbedInRoleSetupModal.test(modal.customId)) {
			// vars
			const rolesSetupInfo: RoleSetupData = await getRolesSetupInfo(modal, modalID)
			const [x, y, z] = getRolesSetupButtons(modalID, rolesSetupInfo)
			const embedTitle = modal.fields.getTextInputValue('embedTitle').trim()
			const embedDescription = modal.fields.getTextInputValue('embedDescription').trim()

			// edit data
			rolesSetupInfo.title = embedTitle
			rolesSetupInfo.description = embedDescription.trim()

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
					content: 'Internal Error'
				})
			}
		}
	}
}
