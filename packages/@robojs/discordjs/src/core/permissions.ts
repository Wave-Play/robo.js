/**
 * Permission inference for @robojs/discordjs
 *
 * Aggregates and manages permissions from command metadata.
 * Supports guild-specific permission overrides.
 */
import { PermissionFlagsBits } from 'discord.js'
import type { CommandEntry, ContextEntry } from '../types/index.js'
import { discordLogger } from './logger.js'

/**
 * Map of permission names to their bitfield values.
 */
export const PERMISSION_FLAGS = PermissionFlagsBits

/**
 * Aggregated permission information for a command.
 */
export interface AggregatedPermissions {
	/** Default member permissions required (bitfield) */
	defaultMemberPermissions: bigint | null
	/** Permission names for display */
	permissionNames: string[]
	/** Guild-specific overrides */
	guildOverrides: Map<string, bigint>
}

/**
 * Reverse mapping from permission bits to names.
 */
const permissionBitToName = Object.fromEntries(
	Object.entries(PermissionFlagsBits).map(([key, value]) => [value.toString(), key])
)

/**
 * Get permission names from a bitfield.
 *
 * @param permissions - Permission bitfield
 * @returns Array of permission names
 */
export function getPermissionNames(permissions: bigint | string | number | null | undefined): string[] {
	if (permissions === null || permissions === undefined) {
		return []
	}

	const bits = BigInt(permissions)
	const names: string[] = []

	for (const [bitStr, name] of Object.entries(permissionBitToName)) {
		const bit = BigInt(bitStr)
		if ((bits & bit) === bit) {
			names.push(name)
		}
	}

	return names
}

/**
 * Aggregate permissions from command entries.
 *
 * @param commands - Map of command names to entries
 * @returns Map of command keys to aggregated permissions
 */
export function aggregateCommandPermissions(
	commands: Record<string, CommandEntry>
): Map<string, AggregatedPermissions> {
	const result = new Map<string, AggregatedPermissions>()

	function processEntry(key: string, entry: CommandEntry) {
		const defaultMemberPermissions = entry.defaultMemberPermissions
			? BigInt(entry.defaultMemberPermissions)
			: null

		result.set(key, {
			defaultMemberPermissions,
			permissionNames: getPermissionNames(defaultMemberPermissions),
			guildOverrides: new Map()
		})

		// Process subcommands recursively
		if (entry.subcommands) {
			for (const [subKey, subEntry] of Object.entries(entry.subcommands)) {
				processEntry(`${key} ${subKey}`, subEntry)
			}
		}
	}

	for (const [key, entry] of Object.entries(commands)) {
		processEntry(key, entry)
	}

	return result
}

/**
 * Aggregate permissions from context menu entries.
 *
 * @param contextMenus - Map of context menu names to entries
 * @returns Map of context menu keys to aggregated permissions
 */
export function aggregateContextPermissions(
	contextMenus: Record<string, ContextEntry>
): Map<string, AggregatedPermissions> {
	const result = new Map<string, AggregatedPermissions>()

	for (const [key, entry] of Object.entries(contextMenus)) {
		const defaultMemberPermissions = entry.defaultMemberPermissions
			? BigInt(entry.defaultMemberPermissions)
			: null

		result.set(key, {
			defaultMemberPermissions,
			permissionNames: getPermissionNames(defaultMemberPermissions),
			guildOverrides: new Map()
		})
	}

	return result
}

/**
 * Set a guild-specific permission override for a command.
 *
 * @param permissions - The aggregated permissions map
 * @param commandKey - The command key
 * @param guildId - The guild ID
 * @param permissionBits - The permission bitfield for this guild
 */
export function setGuildPermissionOverride(
	permissions: Map<string, AggregatedPermissions>,
	commandKey: string,
	guildId: string,
	permissionBits: bigint
): void {
	const entry = permissions.get(commandKey)
	if (!entry) {
		discordLogger.warn(`Cannot set permission override: command "${commandKey}" not found`)
		return
	}

	entry.guildOverrides.set(guildId, permissionBits)
}

/**
 * Get effective permissions for a command in a specific guild.
 *
 * @param permissions - The aggregated permissions map
 * @param commandKey - The command key
 * @param guildId - The guild ID (optional)
 * @returns The effective permission bitfield
 */
export function getEffectivePermissions(
	permissions: Map<string, AggregatedPermissions>,
	commandKey: string,
	guildId?: string
): bigint | null {
	const entry = permissions.get(commandKey)
	if (!entry) {
		return null
	}

	// Check for guild override first
	if (guildId) {
		const override = entry.guildOverrides.get(guildId)
		if (override !== undefined) {
			return override
		}
	}

	return entry.defaultMemberPermissions
}

/**
 * Validate that a user has the required permissions for a command.
 *
 * @param userPermissions - The user's permission bitfield
 * @param requiredPermissions - The required permission bitfield
 * @returns True if user has all required permissions
 */
export function hasRequiredPermissions(
	userPermissions: bigint,
	requiredPermissions: bigint | null
): boolean {
	if (requiredPermissions === null) {
		return true // No permissions required
	}

	return (userPermissions & requiredPermissions) === requiredPermissions
}

/**
 * Get missing permissions for a user.
 *
 * @param userPermissions - The user's permission bitfield
 * @param requiredPermissions - The required permission bitfield
 * @returns Array of missing permission names
 */
export function getMissingPermissions(
	userPermissions: bigint,
	requiredPermissions: bigint | null
): string[] {
	if (requiredPermissions === null) {
		return []
	}

	const missing = requiredPermissions & ~userPermissions
	return getPermissionNames(missing)
}

/**
 * Combine multiple permission bitfields.
 *
 * @param permissions - Array of permission bitfields
 * @returns Combined permission bitfield
 */
export function combinePermissions(...permissions: (bigint | null | undefined)[]): bigint {
	return permissions.reduce<bigint>((acc, perm) => {
		if (perm === null || perm === undefined) {
			return acc
		}
		return acc | perm
	}, 0n)
}
