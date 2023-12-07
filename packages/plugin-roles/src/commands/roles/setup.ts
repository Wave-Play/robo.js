// imports
import type { CommandConfig, CommandResult } from '@roboplay/robo.js'
import type { CommandInteraction } from 'discord.js'
import { Flashcore } from '@roboplay/robo.js'
import { RoleSetupData } from '../../core/types.js'
import { getRolesSetupButtons, getRolesSetupEmbed } from '../../core/utils.js'

export const config: CommandConfig = {
	description: 'Setup roles'
}

export default async (interaction: CommandInteraction): Promise<void> => {
	// Intro
	const ID = crypto.randomUUID()
	const BASE_DATA: RoleSetupData = {
		id: ID,
		title: 'Role Selector!',
		description: 'Select Roles From Dropdown Below!'
	}

	// create db instance
	await Flashcore.set(`__roles_Setup@${ID}`, BASE_DATA)
	const [x, y, z] = getRolesSetupButtons(ID, BASE_DATA)

	// reply intro
	await interaction.reply({
		embeds: [getRolesSetupEmbed(BASE_DATA)],
		components: [x, y, z]
	})
}
