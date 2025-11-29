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
	},
	/**
	 * Base ID for the cancel sync button.
	 *
	 * The full custom ID is constructed as `${id}-${syncId}` so each active sync can be
	 * uniquely identified. Clicking this button aborts the sync loop and shows partial
	 * results. Only administrators or the user who started the sync may cancel.
	 */
	CancelSync: {
		id: ID_NAMESPACE + 'button-cancel-sync'
	},
	/**
	 * Base ID for the remove assignee mapping button.
	 *
	 * The full custom ID is constructed as `${id}:${jiraName}` so each mapping can be
	 * uniquely identified. Clicking this button removes the mapping between a Jira
	 * assignee and Discord user. Only administrators can remove mappings.
	 */
	RemoveAssigneeMapping: {
		id: ID_NAMESPACE + 'button-remove-assignee-mapping'
	},
	/**
	 * Button to open an ephemeral message with selects for adding a new assignee mapping.
	 *
	 * When clicked, this button shows an ephemeral message with both a Jira assignee
	 * select and Discord user select. The mapping is created automatically when both
	 * are selected.
	 */
	AddAssigneeMapping: {
		id: ID_NAMESPACE + 'button-add-assignee-mapping'
	},
	/**
	 * Button to open an ephemeral message with role select for managing authorized creator roles.
	 *
	 * When clicked, this button shows an ephemeral message with a role select menu.
	 * Selecting roles updates the authorized creator roles and refreshes the setup message.
	 */
	ManageAuthorizedRoles: {
		id: ID_NAMESPACE + 'button-manage-authorized-roles'
	},
	/**
	 * Base ID for the view sync errors button.
	 *
	 * The full custom ID is constructed as `${id}-${syncId}` so each sync's errors can be
	 * uniquely identified. Clicking this button shows an ephemeral message with a browsable
	 * list of errors that occurred during synchronization.
	 */
	ViewSyncErrors: {
		id: ID_NAMESPACE + 'button-view-sync-errors'
	},
	/**
	 * Base ID for the remove column mapping button.
	 *
	 * The full custom ID is constructed as `${id}:${status}` so each mapping can be
	 * uniquely identified. Clicking this button removes the mapping between a provider
	 * status and a column. Only administrators can remove mappings.
	 */
	RemoveColumnMapping: {
		id: ID_NAMESPACE + 'button-remove-column-mapping'
	},
	/**
	 * Button to open an ephemeral message with selects for adding a new column mapping.
	 *
	 * When clicked, this button shows an ephemeral message with both a provider status
	 * select and column select. The mapping is created automatically when both are selected.
	 */
	AddColumnMapping: {
		id: ID_NAMESPACE + 'button-add-column-mapping'
	},
	/**
	 * Button to navigate to the provider settings page from the overview.
	 *
	 * When clicked, this button morphs the setup message to show provider-specific
	 * settings (assignee and column mappings).
	 */
	SetupProviderSettings: {
		id: ID_NAMESPACE + 'setup:provider-settings'
	},
	/**
	 * Button to navigate back to the overview page from provider settings.
	 *
	 * When clicked, this button morphs the setup message back to the overview view.
	 */
	SetupBackOverview: {
		id: ID_NAMESPACE + 'setup:back-overview'
	},
	/**
	 * Base ID for the view all mappings button.
	 *
	 * The full custom ID is constructed as `${id}:${type}` where type is either
	 * 'assignee' or 'column'. Clicking this button shows an ephemeral message
	 * with the complete list of mappings.
	 */
	ViewAllMappings: {
		id: ID_NAMESPACE + 'button-view-all-mappings'
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
	},
	/**
	 * String select menu for choosing a Jira assignee name to map.
	 *
	 * Used in the setup command to allow administrators to select which Jira
	 * assignee name they want to map to a Discord user. Populated with known
	 * Jira assignee names from synced cards.
	 */
	AssigneeJiraName: {
		id: ID_NAMESPACE + 'select-assignee-jira'
	},
	/**
	 * User select menu for choosing a Discord user to map to a Jira assignee.
	 *
	 * Used in the setup command to allow administrators to select which Discord
	 * user should be mentioned when a Jira assignee appears in roadmap cards.
	 */
	AssigneeDiscordUser: {
		id: ID_NAMESPACE + 'select-assignee-discord'
	},
	/**
	 * String select menu for choosing a provider status name to map.
	 *
	 * Used in the setup command to allow administrators to select which provider
	 * status they want to map to a column. Populated with known status names from synced cards.
	 */
	ColumnMappingStatus: {
		id: ID_NAMESPACE + 'select-column-mapping-status'
	},
	/**
	 * String select menu for choosing a column to map a status to.
	 *
	 * Used in the setup command to allow administrators to select which column
	 * a provider status should map to, or select "Track Only" to map to null.
	 */
	ColumnMappingColumn: {
		id: ID_NAMESPACE + 'select-column-mapping-column'
	}
} as const
