/**
 * Core type definitions shared by the Robo.js roadmap plugin.
 *
 * @remarks
 * These types are consumed by roadmap providers, synchronization workflows, and Discord rendering
 * pipelines. They intentionally capture the minimal fields necessary to translate external
 * project management data into Discord friendly content while remaining flexible for future
 * extensions.
 *
 * @example
 * ```ts
 * import type { RoadmapCard, SyncResult } from '@robojs/roadmap';
 *
 * const card: RoadmapCard = {
 *   id: 'CARD-42',
 *   title: 'Voice transcription support',
 *   description: 'Expose voice transcription results inside the Discord activity.',
 *   labels: ['voice', 'beta'],
 *   column: 'In Progress',
 *   assignees: [
 *     { id: 'user-123', name: 'Alex Example', avatarUrl: 'https://cdn.example/avatar.png' },
 *   ],
 *   url: 'https://jira.example/browse/CARD-42',
 *   updatedAt: new Date(),
 *   metadata: { priority: 'High' },
 * };
 *
 * const result: SyncResult = {
 *   cards: [card],
 *   columns: [
 *     { id: 'in-progress', name: 'In Progress', order: 2, archived: false },
 *   ],
 *   syncedAt: new Date(),
 *   stats: { total: 1, created: 1, updated: 0, archived: 0, errors: 0 },
 * };
 * ```
 */

// Card Data -----------------------------------------------------------------

/**
 * Represents a unit of work surfaced by the roadmap.
 *
 * @remarks
 * Each card mirrors an entity fetched from the external provider (issue, ticket, card, etc.). The
 * metadata is designed to support Discord specific rendering while preserving provider identifiers
 * for bidirectional navigation.
 */
export type RoadmapCard = {
	/**
	 * Unique identifier assigned by the provider (e.g., Jira issue key).
	 */
	readonly id: string
	/**
	 * Concise title or summary displayed to Discord users.
	 */
	readonly title: string
	/**
	 * Rich description used when posting updates or expanding a card.
	 */
	readonly description: string
	/**
	 * Labels associated with the card; maps to Discord forum tags where applicable.
	 */
	readonly labels: string[]
	/**
	 * Identifier of the column or status the card currently resides in.
	 */
	readonly column: string
	/**
	 * Contributors actively working on the card.
	 */
	readonly assignees: Array<{
		/**
		 * Provider level identifier for the user.
		 */
		readonly id: string
		/**
		 * Display name suitable for Discord presentation.
		 */
		readonly name: string
		/**
		 * Optional avatar or profile image URL.
		 */
		readonly avatarUrl?: string
	}>
	/**
	 * Deep link to the provider for additional context.
	 */
	readonly url: string
	/**
	 * Timestamp representing the last modification time in the provider.
	 */
	readonly updatedAt: Date
	/**
	 * Provider specific metadata that does not have a dedicated field.
	 * May be omitted when not needed by the provider.
	 */
	readonly metadata?: Record<string, unknown>
}

// Column Metadata -----------------------------------------------------------

/**
 * Describes a column or lane used to organize roadmap cards.
 *
 * @remarks
 * Providers should return all actionable columns so the sync engine can mirror the structure in
 * Discord. Archived columns inform downstream logic to hide or store cards without deleting data.
 */
export type RoadmapColumn = {
	/**
	 * Provider assigned identifier for the column.
	 */
	readonly id: string
	/**
	 * Human readable column label.
	 */
	readonly name: string
	/**
	 * Relative order used for sorting columns from left to right.
	 */
	readonly order: number
	/**
	 * Signals whether items in this column should be considered archived.
	 */
	readonly archived: boolean
}

// Provider Configuration ----------------------------------------------------

/**
 * Metadata describing a roadmap provider implementation.
 *
 * @remarks
 * Used for diagnostics, logging, and telemetry. Providers should surface meaningful
 * information that helps operators debug issues, such as API versions or enabled features.
 */
export type ProviderInfo = {
	/**
	 * Human readable provider name (e.g., `Jira`, `GitHub Projects`).
	 */
	readonly name: string
	/**
	 * Semantic version of the provider implementation.
	 */
	readonly version: string
	/**
	 * List of capabilities supported by this provider (e.g., `cards`, `columns`, `attachments`).
	 */
	readonly capabilities: readonly string[]
	/**
	 * Optional provider specific metadata for diagnostics or configuration details.
	 */
	readonly metadata?: Record<string, unknown>
}

/**
 * Identifies the provider implementation and its raw configuration.
 *
 * @remarks
 * The `options` bag is intentionally untyped to allow provider packages to define their own
 * schema. Providers should validate and coerce values during
 * {@link import('./providers/base.js').RoadmapProvider.validateConfig}.
 */
export type ProviderConfig = {
	/**
	 * Provider type identifier (e.g., `jira`, `github`).
	 */
	readonly type: string
	/**
	 * Implementation specific configuration options.
	 */
	readonly options: Record<string, unknown>
}

// Card Creation -------------------------------------------------------------

/**
 * Input required to create a new roadmap card in the external provider.
 *
 * @remarks
 * This interface captures the minimum data needed to create a card across any provider
 * implementation. Providers should map these fields to their native data models (e.g., Jira
 * issue fields, GitHub issue properties).
 *
 * Provider-specific considerations:
 * - Column names must match one of the columns returned by the provider's `getColumns()` method
 * - Assignee IDs must be valid user identifiers in the provider's system
 * - Labels should follow the provider's naming conventions and constraints
 * - Issue type names must match one of the types returned by the provider's `getIssueTypes()` method
 * - If issue type is omitted, the provider's configured default issue type is used
 *
 * @example
 * ```ts
 * import type { CreateCardInput } from '@robojs/roadmap';
 *
 * const input: CreateCardInput = {
 *   title: 'Add dark mode support',
 *   description: 'Implement dark mode theme across the application',
 *   column: 'Backlog',
 *   labels: ['enhancement', 'ui'],
 *   issueType: 'Task'
 * };
 * ```
 */
export type CreateCardInput = {
	/**
	 * Card title or summary displayed to users.
	 */
	readonly title: string
	/**
	 * Detailed description or body content for the card.
	 */
	readonly description: string
	/**
	 * Target column name where the card should be created (e.g., 'Backlog', 'In Progress').
	 */
	readonly column: string
	/**
	 * Optional array of label names to associate with the card.
	 */
	readonly labels?: string[]
	/**
	 * Optional issue type name for the card (e.g., 'Task', 'Story', 'Bug', 'Epic').
	 * If omitted, the provider's default issue type is used.
	 * The available issue types are provider-specific and can be retrieved via the provider's getIssueTypes() method.
	 */
	readonly issueType?: string
	/**
	 * Optional array of assignees to assign to the card.
	 * Each assignee must have a provider-specific ID that matches a valid user in the provider's system.
	 */
	readonly assignees?: Array<{
		/**
		 * Provider-specific user identifier.
		 */
		readonly id: string
		/**
		 * Display name for the assignee.
		 */
		readonly name: string
	}>
}

/**
 * Result of a card creation operation.
 *
 * @remarks
 * This interface standardizes the response from provider card creation operations, allowing
 * consumers to handle both success and failure cases consistently.
 *
 * On success, the `card` field contains the fully populated card as returned by the provider.
 * On failure, the `message` field provides details about what went wrong.
 */
export type CreateCardResult = {
	/**
	 * The created card with full details populated by the provider.
	 * On failure, this may contain partial data based on the input for debugging purposes.
	 */
	readonly card: RoadmapCard
	/**
	 * Whether the card creation succeeded.
	 */
	readonly success: boolean
	/**
	 * Optional message providing additional context about the creation result.
	 * Typically used for error messages when `success` is false.
	 */
	readonly message?: string
}

// Card Updates ---------------------------------------------------------------

/**
 * Input required to update an existing roadmap card in the external provider.
 *
 * @remarks
 * This interface supports partial updates - only provided fields are changed in the provider.
 * Omitted fields remain unchanged, allowing targeted edits without fetching and resending all
 * card data.
 *
 * Provider-specific considerations:
 * - All fields are optional; at least one field should be provided for a meaningful update
 * - Column names must match one of the columns returned by the provider's `getColumns()` method
 * - Assignee IDs must be valid user identifiers in the provider's system
 * - Labels completely replace existing labels; provide the full desired set
 * - Some providers may have limitations (e.g., Jira supports only one assignee)
 *
 * @example
 * ```ts
 * import type { UpdateCardInput } from '@robojs/roadmap';
 *
 * // Update only the title
 * const input1: UpdateCardInput = {
 *   title: 'Updated title'
 * };
 *
 * // Update multiple fields
 * const input2: UpdateCardInput = {
 *   title: 'Add dark mode support',
 *   description: 'Implement dark mode theme across the application',
 *   column: 'In Progress',
 *   labels: ['enhancement', 'ui', 'wip']
 * };
 * ```
 */
export type UpdateCardInput = {
	/**
	 * Updated card title or summary. If omitted, the existing title is unchanged.
	 */
	readonly title?: string
	/**
	 * Updated detailed description or body content. If omitted, the existing description is unchanged.
	 */
	readonly description?: string
	/**
	 * Target column name where the card should be moved (e.g., 'In Progress', 'Done').
	 * If omitted, the card remains in its current column.
	 */
	readonly column?: string
	/**
	 * Updated array of label names to associate with the card.
	 * Completely replaces existing labels - provide the full desired set.
	 * If omitted, existing labels are unchanged.
	 */
	readonly labels?: string[]
	/**
	 * Updated array of assignees to assign to the card.
	 * If omitted, existing assignees are unchanged.
	 * Each assignee must have a provider-specific ID that matches a valid user in the provider's system.
	 */
	readonly assignees?: Array<{
		/**
		 * Provider-specific user identifier.
		 */
		readonly id: string
		/**
		 * Display name for the assignee.
		 */
		readonly name: string
	}>
}

/**
 * Result of a card update operation.
 *
 * @remarks
 * This interface standardizes the response from provider card update operations, allowing
 * consumers to handle both success and failure cases consistently.
 *
 * On success, the `card` field contains the fully updated card as returned by the provider.
 * On failure, the `message` field provides details about what went wrong.
 */
export type UpdateCardResult = {
	/**
	 * The updated card with full details populated by the provider.
	 * On failure, this may contain partial data based on the input for debugging purposes.
	 */
	readonly card: RoadmapCard
	/**
	 * Whether the card update succeeded.
	 */
	readonly success: boolean
	/**
	 * Optional message providing additional context about the update result.
	 * Typically used for error messages when `success` is false.
	 */
	readonly message?: string
}

// Synchronization Results ---------------------------------------------------

/**
 * Captures the result of a synchronization run between a provider and the roadmap surface.
 *
 * @remarks
 * Consumers can leverage this structure to determine whether cards need to be created, updated, or
 * archived within Discord. The stats block enables runtime analytics and logging without inspecting
 * the card arrays.
 */
export type SyncResult = {
	/**
	 * Readonly snapshot of all cards retrieved during the sync.
	 */
	readonly cards: readonly RoadmapCard[]
	/**
	 * Readonly column definitions included in the sync.
	 */
	readonly columns: readonly RoadmapColumn[]
	/**
	 * Timestamp noting when the sync completed.
	 */
	readonly syncedAt: Date
	/**
	 * Aggregated counters describing sync operations.
	 */
	readonly stats: {
		/**
		 * Total number of cards processed.
		 */
		readonly total: number
		/**
		 * Cards created during the sync.
		 */
		readonly created: number
		/**
		 * Cards updated during the sync.
		 */
		readonly updated: number
		/**
		 * Cards archived or transitioned to an archival column.
		 */
		readonly archived: number
		/**
		 * Number of operations that resulted in errors.
		 */
		readonly errors: number
	}
}

// Date Range Filtering ------------------------------------------------------

/**
 * Specifies filtering criteria for fetching roadmap cards by date range.
 *
 * @remarks
 * This interface enables programmatic retrieval of cards within specific time windows, useful
 * for fetching recent changes, generating reports, or analyzing activity over time. The filter
 * supports both Date objects and ISO 8601 strings for maximum flexibility across different
 * JavaScript environments and serialization scenarios.
 *
 * Date field semantics:
 * - `created`: Filters by the card creation timestamp
 * - `updated`: Filters by the last modification timestamp (default)
 *
 * Default behavior when date fields are omitted:
 * - If only `startDate` is provided: Fetches cards from that date forward
 * - If only `endDate` is provided: Fetches cards up to that date
 * - If neither is provided: Behavior is provider-specific (may return all cards or apply a default range)
 *
 * Provider-specific considerations:
 * - Date field availability varies by provider (Jira supports both 'created' and 'updated', GitHub may have different field names)
 * - Date precision and timezone handling is provider-specific; implementations should document their timezone behavior
 * - Some providers may have limitations on date range queries (e.g., maximum range, pagination requirements)
 * - Large date ranges may require pagination; providers should handle this transparently
 * - Results should be cached with appropriate TTL to minimize API calls
 *
 * @example
 * Fetching cards from last month using Date objects:
 * ```ts
 * import type { DateRangeFilter } from '@robojs/roadmap';
 *
 * const lastMonth = new Date();
 * lastMonth.setMonth(lastMonth.getMonth() - 1);
 *
 * const filter: DateRangeFilter = {
 *   startDate: lastMonth,
 *   endDate: new Date()
 * };
 *
 * const cards = await provider.fetchCardsByDateRange?.(filter);
 * ```
 *
 * @example
 * Fetching cards in a specific range using ISO strings:
 * ```ts
 * const filter: DateRangeFilter = {
 *   startDate: '2025-09-01',
 *   endDate: '2025-09-30'
 * };
 *
 * const septemberCards = await provider.fetchCardsByDateRange?.(filter);
 * ```
 *
 * @example
 * Filtering by created date instead of updated date:
 * ```ts
 * const filter: DateRangeFilter = {
 *   startDate: '2025-01-01',
 *   dateField: 'created'
 * };
 *
 * const cardsCreatedThisYear = await provider.fetchCardsByDateRange?.(filter);
 * ```
 *
 * @see {@link import('./providers/base.js').RoadmapProvider.fetchCardsByDateRange}
 */
export type DateRangeFilter = {
	/**
	 * The beginning of the date range (inclusive).
	 * Accepts both Date objects and ISO 8601 strings (e.g., '2025-01-01').
	 */
	readonly startDate?: Date | string
	/**
	 * The end of the date range (inclusive).
	 * Accepts both Date objects and ISO 8601 strings (e.g., '2025-01-31').
	 */
	readonly endDate?: Date | string
	/**
	 * Which date field to filter on.
	 * Defaults to 'updated' if not specified.
	 */
	readonly dateField?: 'created' | 'updated'
}

// Thread History ------------------------------------------------------------

/**
 * Represents a historical thread entry for a card that has moved between columns.
 *
 * @remarks
 * Thread history enables linking to previous discussions when a card moves to a new forum.
 * The messageCount is used to determine if the old thread had meaningful user activity
 * and to provide informative linking text (e.g., "View 52 old messages").
 *
 * This entry is created when a thread is moved to a different forum (Phase 2), capturing
 * the thread's state at the time of the move. Multiple history entries can exist for a
 * single card if it moves through multiple columns over time.
 *
 * @example
 * ```ts
 * import type { ThreadHistoryEntry } from '@robojs/roadmap';
 *
 * const historyEntry: ThreadHistoryEntry = {
 *   threadId: '1234567890123456789',
 *   column: 'In Progress',
 *   forumId: '9876543210987654321',
 *   movedAt: Date.now(),
 *   messageCount: 52 // Includes starter message + 51 user messages
 * };
 * ```
 */
export type ThreadHistoryEntry = {
	/**
	 * The Discord thread ID of the historical thread.
	 */
	readonly threadId: string
	/**
	 * The column name the thread was in before being moved.
	 */
	readonly column: string
	/**
	 * The forum channel ID where this thread existed.
	 */
	readonly forumId: string
	/**
	 * Unix timestamp in milliseconds when the thread was moved to a new forum.
	 */
	readonly movedAt: number
	/**
	 * Optional count of total messages in the thread at the time of move.
	 *
	 * This count includes the starter message plus all user messages. It's used
	 * to determine if the thread had meaningful user activity (messageCount > 1)
	 * and to generate informative link text like "View 52 messages".
	 *
	 * Only populated when the thread is actually moved (Phase 2). Threads with
	 * only the starter message (messageCount = 1) typically won't be linked.
	 */
	readonly messageCount?: number
}

/**
 * Metadata describing an active roadmap sync operation.
 *
 * @remarks
 * Used by the `/roadmap sync` command to track in-flight syncs and enable
 * cancellation via interaction components. Entries are removed when the sync
 * completes, fails, or is canceled, and may also be pruned on a timeout.
 *
 * @example
 * ```ts
 * const syncData: SyncData = {
 *   controller: new AbortController(),
 *   startedBy: interaction.user.id,
 *   guildId: interaction.guildId!,
 *   dryRun: false,
 *   startedAt: Date.now()
 * }
 * activeSyncs.set(interaction.id, syncData)
 * ```
 */
export interface SyncData {
	/**
	 * Abort controller used to cancel the sync from user interactions.
	 */
	readonly controller: AbortController
	/**
	 * Discord user ID of the user who initiated the sync; used for authorization.
	 */
	readonly startedBy: string
	/**
	 * Discord guild ID where the sync is executing.
	 */
	readonly guildId: string
	/**
	 * Indicates whether the sync is running in dry-run mode.
	 */
	readonly dryRun: boolean
	/**
	 * Unix timestamp (milliseconds) when the sync started; enables timeout cleanup.
	 */
	readonly startedAt: number
	/**
	 * Optional timeout identifier used to auto-cleanup abandoned syncs.
	 *
	 * The `/roadmap sync` command schedules a 15-minute timeout when a sync begins.
	 * This timeout is cleared on normal completion, explicit cancellation, or error.
	 * If the timeout triggers, the sync entry is removed from the in-memory `activeSyncs`
	 * map and a warning is logged to indicate an abnormal termination (e.g., crash or
	 * interaction expiration). Storing the ID allows us to cancel the timeout to avoid
	 * unnecessary callbacks and potential memory leaks.
	 */
	readonly cleanupTimeoutId?: ReturnType<typeof setTimeout>
}
