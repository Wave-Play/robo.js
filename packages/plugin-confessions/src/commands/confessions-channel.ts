// imports
import { FLASHCORE_KEY } from '../core/config.js'
import { type CommandConfig } from '@roboplay/robo.js'
import { PermissionFlagsBits, type Channel, type CommandInteraction } from 'discord.js'
import { setState, getState } from '@roboplay/robo.js'

export const config: CommandConfig = {
	description: 'Specify the Confessions Channel',
	options: [
		{
			description: 'Specify the Confessions Channel!',
			name: 'channel',
			required: false,
			type: 'channel'
		}
	]
}

export default async (interaction: CommandInteraction) => {
	const channel = interaction.options.get('channel')?.channel as Channel

	// info about current channel
	if (!channel) {
		const currentConfessionsChannel = getState(`${FLASHCORE_KEY}_${interaction.guild!.id}`)
		return currentConfessionsChannel
			? `Current Confessions Channel is Configured To :- **<#${currentConfessionsChannel}>**`
			: `No Confessions Channel is set for this Guild!\n> ### Ask Admins to configure Confessions channel using commands \` / confessions-channel \``
	}

	// admin check
	if (
		!(
			interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
			interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
		)
	) {
		return 'Oops! It looks like you need administrative permissions to run that command. Please contact an admin or server manager for assistance.'
	}

	// channel mentioned is wrong
	if (!(channel.type == 0)) {
		return 'Please note that the mentioned channel should be a ` Text Channel ` for this operation to work correctly.'
	}

	// save channel as confessions channel
	setState(`${FLASHCORE_KEY}_${channel.guild.id}`, channel.id, {
		persist: true
	})

	// return status
	return 'Great news! The Confessions Channel has been set up successfully!'
}
