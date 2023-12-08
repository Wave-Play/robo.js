// imports
import { hasPerm } from '../core/utils.js'
import { Flashcore, type MiddlewareData, type MiddlewareResult } from '@roboplay/robo.js'
import { PermissionFlagsBits, type ChatInputCommandInteraction, GuildMemberRoleManager } from 'discord.js'
import { RoleRestrictionData } from '../core/types.js'

/**
 * Logger to check configured command restrictions
 */
export default async (data: MiddlewareData): Promise<MiddlewareResult | void> => {
	// vars
	const { key, type } = data.record
	const interaction = data.payload[0] as ChatInputCommandInteraction

	// Only commands
	if (type !== 'command' || !interaction.guild) {
		return
	}

	// Get Data
	const restrictedData: RoleRestrictionData[] | undefined = await Flashcore.get(
		`__roles_Setup_Restrict@${interaction.guild!.id}`
	)
	let status = true
	// check
	restrictedData?.forEach((x) => {
		if (x.command == key) {
			// if cmd matches
			const res = (interaction.member?.roles as GuildMemberRoleManager).cache.filter((X) => X.id == x.role)
			if (res) {
				status = false
			}
		}
	})

	// if not enabled for role
	if (status) {
		return
	}

	// Don't stop down "/roles restrict" command (so that we can enable/disable cmd)
	if (key === 'roles/restrict') {
		return
	}

	// Alright, restrict time
	if (!hasPerm(interaction, PermissionFlagsBits.Administrator) && interaction.reply) {
		await interaction.reply({
			content: `Sorry, this command is currently restricted to you!`,
			ephemeral: true
		})

		return { abort: true }
	}
}
