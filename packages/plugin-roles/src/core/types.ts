// imports
import { UUID } from 'crypto'
import { Emoji, Snowflake } from 'discord.js'

/**
 * Role Object On DB
 */
export type RoleSetupDataRole = {
	label: string
	role: string | Snowflake
	emote?: string | Emoji
	description?: string
}

/**
 * Active Setup On DB To share State
 */
export interface RoleSetupData {
	id: UUID
	title: string
	description: string
	color?: string
	roles?: RoleSetupDataRole[]
}

/**
 * Role Restriction Data DB Instance
 */
export type RoleRestrictionData = { command: string, role: Snowflake, restrict: boolean }

/**
 * Codes to match and find appropirate handler
 * @todo FIX IT
 */
export const REGEXPS = {
	editEmbedInRoleSetupModal: new RegExp(
		/^editEmbedInRoleSetupModal@([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})$/
	),
	editEmbedInRoleSetupButton: new RegExp(
		/^editEmbedInRoleSetupButton@([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})$/
	),
	printSetupBtn: new RegExp(
		/^printSetupBtn@([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})$/
	),
	roleSetupAddRoleSelector: new RegExp(
		/^roleSetupAddRoleSelector@([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})$/
	),
	roleSetupDeleteRoleSelector: new RegExp(
		/^roleSetupDeleteRoleSelector@([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})$/
	),
	roleSetupAddRoleSelectedModal: new RegExp(
		/^RSetupM@([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})@(.+)$/
	),
	roleDropperRoleSelectFromEmbed: new RegExp('todo')
}
