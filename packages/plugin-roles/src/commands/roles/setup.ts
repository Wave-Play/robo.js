// imports
import type { CommandConfig, CommandResult } from '@roboplay/robo.js'
import { PermissionFlagsBits, type CommandInteraction } from 'discord.js'
import { Flashcore } from '@roboplay/robo.js'
import { RoleSetupData } from '../../core/types.js'
import { getRolesSetupButtons, getRolesSetupEmbed, hasPerm } from '../../core/utils.js'

export const config: CommandConfig = {
	dmPermission: false,
	description: 'Initialize setup for drop-down roles creation'
}

export default async (interaction: CommandInteraction): Promise<CommandResult> => {
	// Intro
	const ID = crypto.randomUUID()
	const BASE_DATA: RoleSetupData = {
		id: ID,
		title: '🍣 Drop-Down Role Selector!',
		description: `> Navigate below to access the dropdown menu and choose your desired role. Enhance your server experience by selecting the roles that align with your interests or responsibilities. This allows you to tailor your engagement and access specific channels or features. Make your selection, and enjoy a personalized and enriched interaction within the community`
	}

	if (!hasPerm(interaction, PermissionFlagsBits.ManageRoles)) {
		return {
			content: `🌡️ Insufficient permissions to use this command!`,
			ephemeral: true
		}
	}

	// create db instance
	await Flashcore.set(`__roles_Setup@${ID}`, BASE_DATA)
	const [x, y, z] = getRolesSetupButtons(ID, BASE_DATA)

	// reply intro
	return {
		embeds: [getRolesSetupEmbed(BASE_DATA)],
		components: [x, y, z]
	}
}
