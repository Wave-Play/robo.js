/**
 * Constants used throughout the @robojs/roadmap plugin.
 *
 * This module defines namespace identifiers for component IDs and settings storage,
 * as well as button IDs for interactive components.
 */

/**
 * Namespace prefix for all component IDs and settings storage.
 *
 * This constant is used in two ways:
 * 1. As a prefix for Discord component custom IDs to avoid collisions
 * 2. As part of the Flashcore settings namespace: `@robojs/roadmap:{guildId}`
 *
 * @example
 * ```ts
 * // Component ID usage
 * const buttonId = ID_NAMESPACE + 'button-toggle-public';
 *
 * // Settings namespace usage
 * const namespace = ID_NAMESPACE + guildId;
 * const settings = getState('settings', { namespace });
 * ```
 */
export const ID_NAMESPACE = '@robojs/roadmap:'

/**
 * Button component IDs used in interactive messages.
 *
 * Each button ID is prefixed with the namespace to ensure uniqueness
 * across all plugins and prevent conflicts with other components.
 *
 * @example
 * ```ts
 * import { ButtonBuilder, ButtonStyle } from 'discord.js';
 * import { Buttons } from './constants.js';
 *
 * // Create a toggle public button
 * const button = new ButtonBuilder()
 *   .setCustomId(Buttons.TogglePublic.id)
 *   .setLabel('Toggle Public Access')
 *   .setStyle(ButtonStyle.Primary);
 * ```
 */
export const Buttons = {
	/**
	 * Button to toggle between public (read-only) and private (admin/mod only) forum access.
	 *
	 * When clicked, this button triggers permission updates on the forum channel:
	 * - Private mode: Only administrators and moderators can view the forum
	 * - Public mode: Everyone can view and read, but only admins/mods can post
	 */
	TogglePublic: {
		id: ID_NAMESPACE + 'button-toggle-public'
	}
} as const

/**
 * Select menu component IDs used in interactive messages.
 *
 * Each select menu ID is prefixed with the namespace to ensure uniqueness
 * across all plugins and prevent conflicts with other components.
 *
 * @example
 * ```ts
 * import { RoleSelectMenuBuilder } from 'discord.js';
 * import { Selects } from './constants.js';
 *
 * // Create a role select menu
 * const select = new RoleSelectMenuBuilder()
 *   .setCustomId(Selects.AuthorizedCreatorRoles.id)
 *   .setPlaceholder('Select roles')
 *   .setMinValues(0)
 *   .setMaxValues(10);
 * ```
 */
export const Selects = {
	/**
	 * Role select menu for choosing which roles can create roadmap cards.
	 *
	 * Used in the setup command to allow administrators to grant card creation
	 * permissions to specific roles beyond just administrators. Users with any
	 * of the selected roles will be able to use the `/roadmap add` command.
	 */
	AuthorizedCreatorRoles: {
		id: ID_NAMESPACE + 'select-authorized-creator-roles'
	}
} as const
