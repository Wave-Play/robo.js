/**
 * Shared utility functions for XP commands.
 * Provides permission checking, embed creation, formatting, and validation helpers.
 */

import {
	EmbedBuilder,
	Colors,
	MessageFlags,
	PermissionFlagsBits,
	type ChatInputCommandInteraction,
	type Interaction,
	type InteractionReplyOptions,
	type RepliableInteraction
} from 'discord.js'
import type { CommandResult } from 'robo.js'
import type { GuildConfig } from '../types.js'
import { logger } from 'robo.js'

/**
 * Gets the required permission bit for admin commands.
 * Reads process.env.XP_ADMIN_PERMISSION to allow environment-driven permission override.
 * Falls back to PermissionFlagsBits.ManageGuild on invalid or missing values.
 *
 * @example
 * ```typescript
 * // In environment: XP_ADMIN_PERMISSION=Administrator
 * const permBit = getRequiredPermissionBit() // Returns PermissionFlagsBits.Administrator
 * ```
 */
export function getRequiredPermissionBit(): bigint {
	try {
		// Check for custom permission via env override
		const customPermission = process.env.XP_ADMIN_PERMISSION
		if (customPermission) {
			// Map string to PermissionFlagsBits
			const permKey = customPermission as keyof typeof PermissionFlagsBits
			const permBit = PermissionFlagsBits[permKey]
			if (permBit) {
				return permBit
			}
		}

		// Default: ManageGuild permission
		return PermissionFlagsBits.ManageGuild
	} catch (error) {
		logger.error('Error getting required permission bit:', error)
		return PermissionFlagsBits.ManageGuild
	}
}

/**
 * Checks if user has permission to run admin commands.
 * Supports env override via XP_ADMIN_PERMISSION for custom permission name.
 *
 * @example
 * ```typescript
 * if (!hasAdminPermission(interaction)) {
 *   return createPermissionError()
 * }
 * ```
 */
export function hasAdminPermission(interaction: ChatInputCommandInteraction): boolean {
	try {
		// Check for custom permission via env override
		const customPermission = process.env.XP_ADMIN_PERMISSION
		if (customPermission) {
			// Map string to PermissionFlagsBits
			const permKey = customPermission as keyof typeof PermissionFlagsBits
			const permBit = PermissionFlagsBits[permKey]
			if (permBit && interaction.memberPermissions?.has(permBit)) {
				return true
			}
		}

		// Default: check ManageGuild permission
		return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ?? false
	} catch (error) {
		logger.error('Error checking admin permission:', error)
		return false
	}
}

/**
 * Validates guild context and returns guildId or error message.
 * Uses discriminated union for type safety.
 *
 * @example
 * ```typescript
 * const guildCheck = requireGuild(interaction)
 * if (typeof guildCheck === 'string') {
 *   return { embeds: [createErrorEmbed('Error', guildCheck)] }
 * }
 * const { guildId } = guildCheck
 * ```
 */
export function requireGuild(interaction: Interaction): { guildId: string } | string {
	if (!interaction.guildId) {
		return 'This command can only be used in a server'
	}
	return { guildId: interaction.guildId }
}

/**
 * Returns the embed color from guild config theme or default Blurple.
 *
 * @param config - Guild configuration
 * @returns Embed color (number)
 *
 * @example
 * ```typescript
 * const color = getEmbedColor(config) // Returns 0x5865F2 if theme is set, otherwise Colors.Blurple
 * ```
 */
export function getEmbedColor(config: GuildConfig): number {
	return config.theme?.embedColor ?? Colors.Blurple
}

/**
 * Creates a Unicode progress bar from current/total values.
 *
 * @param current - Current progress value
 * @param total - Total/maximum value
 * @param length - Bar length in characters (default: 10, min: 5, max: 30)
 * @returns Progress bar string using ▰ (filled) and ▱ (empty)
 *
 * @example
 * ```typescript
 * createProgressBar(50, 100, 10) // Returns "▰▰▰▰▰▱▱▱▱▱"
 * createProgressBar(75, 100, 10) // Returns "▰▰▰▰▰▰▱▱▱▱"
 * createProgressBar(100, 100, 10) // Returns "▰▰▰▰▰▰▰▰▰▰"
 * createProgressBar(0, 100, 10) // Returns "▱▱▱▱▱▱▱▱"
 * ```
 */
export function createProgressBar(current: number, total: number, length: number = 10): string {
	// Clamp length between 5 and 30
	const clampedLength = Math.max(5, Math.min(30, length))

	// Handle edge cases
	if (total <= 0 || current <= 0) {
		return '▱'.repeat(clampedLength)
	}
	if (current >= total) {
		return '▰'.repeat(clampedLength)
	}

	// Calculate filled blocks
	const filled = Math.floor((current / total) * clampedLength)
	const empty = clampedLength - filled

	return '▰'.repeat(filled) + '▱'.repeat(empty)
}

/**
 * Formats rank with ordinal suffix (e.g., '1st', '2nd', '3rd', '4th').
 *
 * @param rank - Rank number (1-indexed)
 * @returns Formatted rank string with ordinal suffix
 *
 * @example
 * ```typescript
 * formatRank(1) // Returns "1st"
 * formatRank(2) // Returns "2nd"
 * formatRank(3) // Returns "3rd"
 * formatRank(4) // Returns "4th"
 * formatRank(11) // Returns "11th"
 * formatRank(21) // Returns "21st"
 * ```
 */
export function formatRank(rank: number): string {
	// Special cases for 11, 12, 13 (always 'th')
	if (rank % 100 >= 11 && rank % 100 <= 13) {
		return `${rank}th`
	}

	// Determine suffix based on last digit
	const lastDigit = rank % 10
	switch (lastDigit) {
		case 1:
			return `${rank}st`
		case 2:
			return `${rank}nd`
		case 3:
			return `${rank}rd`
		default:
			return `${rank}th`
	}
}

/**
 * Formats multiplier as percentage or "None".
 *
 * @param multiplier - Multiplier value (e.g., 1.0, 1.5, 0.75)
 * @returns Formatted string (e.g., "None", "+50%", "-25%")
 *
 * @example
 * ```typescript
 * formatMultiplier(1.0) // Returns "None"
 * formatMultiplier(1.5) // Returns "+50%"
 * formatMultiplier(2.0) // Returns "+100%"
 * formatMultiplier(0.75) // Returns "-25%"
 * formatMultiplier(0.5) // Returns "-50%"
 * ```
 */
export function formatMultiplier(multiplier: number): string {
	if (multiplier === 1.0) {
		return 'None'
	}

	if (multiplier > 1.0) {
		const increase = ((multiplier - 1) * 100).toFixed(0)
		return `+${increase}%`
	}

	// multiplier < 1.0
	const decrease = ((1 - multiplier) * 100).toFixed(0)
	return `-${decrease}%`
}

export async function safeReply(
	interaction: RepliableInteraction,
	options: InteractionReplyOptions
): Promise<void> {
	if (interaction.deferred || interaction.replied) {
		await interaction.followUp(options)
	} else {
		await interaction.reply(options)
	}
}

/**
 * Creates a green success embed with optional fields.
 *
 * @param title - Embed title
 * @param description - Embed description
 * @param fields - Optional array of embed fields
 * @param color - Optional custom color (defaults to Colors.Green)
 * @returns EmbedBuilder with green color and timestamp
 */
export function createSuccessEmbed(
	title: string,
	description: string,
	fields?: Array<{ name: string; value: string; inline?: boolean }>,
	color?: number
): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setColor(color ?? Colors.Green)
		.setTitle(title)
		.setDescription(description)
		.setTimestamp()

	if (fields && fields.length > 0) {
		embed.addFields(fields)
	}

	return embed
}

/**
 * Creates a red error embed.
 *
 * @param title - Embed title
 * @param description - Error description
 * @returns EmbedBuilder with red color and timestamp
 */
export function createErrorEmbed(title: string, description: string): EmbedBuilder {
	return new EmbedBuilder().setColor(Colors.Red).setTitle(title).setDescription(description).setTimestamp()
}

/**
 * Creates a blue info embed with optional fields.
 *
 * @param title - Embed title
 * @param description - Embed description
 * @param fields - Optional array of embed fields
 * @param color - Optional custom color (defaults to Colors.Blue)
 * @returns EmbedBuilder with blue color and timestamp
 */
export function createInfoEmbed(
	title: string,
	description: string,
	fields?: Array<{ name: string; value: string; inline?: boolean }>,
	color?: number
): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setColor(color ?? Colors.Blue)
		.setTitle(title)
		.setTimestamp()

	if (description) {
		embed.setDescription(description)
	}

	if (fields && fields.length > 0) {
		embed.addFields(fields)
	}

	return embed
}

/**
 * Formats XP with commas and custom label.
 *
 * @param xp - XP amount to format
 * @param label - Custom label for XP (defaults to 'XP')
 * @returns Formatted string with thousands separators
 *
 * @example
 * formatXP(1500) // Returns '1,500 XP'
 * formatXP(1500, 'Reputation') // Returns '1,500 Reputation'
 * formatXP(1500, 'Points') // Returns '1,500 Points'
 */
export function formatXP(xp: number, label?: string): string {
	return `${xp.toLocaleString('en-US')} ${label ?? 'XP'}`
}

/**
 * Extracts custom XP label from guild config with fallback to 'XP'.
 *
 * @param config - Guild configuration
 * @returns Custom XP display name or 'XP' if not configured
 *
 * @example
 * const label = getXpLabel(config)
 * // Returns 'Reputation' if config.labels.xpDisplayName is set
 * // Returns 'XP' if labels is undefined or xpDisplayName is undefined
 */
export function getXpLabel(config: GuildConfig): string {
	return config.labels?.xpDisplayName ?? 'XP'
}

/**
 * Formats level (e.g., 'Level 5').
 */
export function formatLevel(level: number): string {
	return `Level ${level}`
}

/**
 * Formats user mention (e.g., '<@123456789>').
 */
export function formatUser(userId: string): string {
	return `<@${userId}>`
}

/**
 * Formats role mention (e.g., '<@&123456789>').
 */
export function formatRole(roleId: string): string {
	return `<@&${roleId}>`
}

/**
 * Formats channel mention (e.g., '<#123456789>').
 */
export function formatChannel(channelId: string): string {
	return `<#${channelId}>`
}

/**
 * Formats percentage (e.g., '75.5%').
 */
export function formatPercentage(value: number): string {
	return `${value.toFixed(1)}%`
}

/**
 * Validates numeric amounts.
 *
 * @param amount - Number to validate
 * @param min - Minimum allowed value (default: 0)
 * @param max - Maximum allowed value (optional)
 * @returns Validation result with error message if invalid
 */
export function validateAmount(amount: number, min: number = 0, max?: number): { valid: boolean; error?: string } {
	if (!Number.isFinite(amount)) {
		return { valid: false, error: 'Amount must be a valid number' }
	}

	if (amount < min) {
		return { valid: false, error: `Amount must be at least ${min}` }
	}

	if (max !== undefined && amount > max) {
		return { valid: false, error: `Amount must be at most ${max}` }
	}

	return { valid: true }
}

/**
 * Validates Discord snowflake (18-19 digits).
 */
export function validateSnowflake(id: string): boolean {
	return /^\d{18,19}$/.test(id)
}

/**
 * Returns standard permission denied error (ephemeral).
 */
export function createPermissionError(): CommandResult {
	return {
		embeds: [createErrorEmbed('Permission Denied', 'You do not have permission to use this command.')],
		flags: MessageFlags.Ephemeral
	}
}

/**
 * Returns standard guild-only error (ephemeral).
 */
export function createGuildOnlyError(): CommandResult {
	return {
		embeds: [createErrorEmbed('Server Only', 'This command can only be used in a server, not in direct messages.')],
		flags: MessageFlags.Ephemeral
	}
}

/**
 * Returns user not found error.
 */
export function createUserNotFoundError(userId: string): CommandResult {
	return {
		embeds: [createErrorEmbed('User Not Found', `The user ${formatUser(userId)} has no XP record in this server.`)],
		flags: MessageFlags.Ephemeral
	}
}
