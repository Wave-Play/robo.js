/**
 * @module @robojs/roadmap
 *
 * @description
 * Public entry point for the Robo.js roadmap plugin. The module exposes the provider contract and
 * foundational types required to implement roadmap data sources such as Jira, GitHub Projects, or
 * Linear. Providers feed cards and column metadata into the sync engine which transforms project
 * updates into Discord friendly content. The plugin includes automatic initialization, command
 * interface for setup and sync operations, and imperative APIs for advanced customization.
 *
 * @example
 * ```ts
 * import { RoadmapProvider, type RoadmapCard, type SyncResult } from '@robojs/roadmap';
 *
 * class LinearProvider extends RoadmapProvider {
 *   async fetchCards(): Promise<RoadmapCard[]> {
 *     return [];
 *   }
 *
 *   async getColumns() {
 *     return [];
 *   }
 *
 *   async getProviderInfo() {
 *     return { name: 'Linear', version: '1.0.0', capabilities: [] };
 *   }
 * }
 *
 * const result: SyncResult = {
 *   cards: [],
 *   columns: [],
 *   syncedAt: new Date(),
 *   stats: { total: 0, created: 0, updated: 0, archived: 0, errors: 0 },
 * };
 * ```
 */

/**
 * Exposes the abstract provider base class used to integrate new roadmap data sources.
 *
 * @remarks
 * Extend {@link RoadmapProvider} to back the roadmap with a custom provider. Implement the
 * required lifecycle methods (`fetchCards`, `getColumns`, `getProviderInfo`) and optionally
 * override `validateConfig` or `init` for additional control.
 *
 * @example
 * ```ts
 * import { RoadmapProvider } from '@robojs/roadmap';
 *
 * class CustomProvider extends RoadmapProvider {
 *   // implement abstract methods here
 * }
 * ```
 *
 * @see {@link RoadmapProvider}
 */
export { RoadmapProvider } from './providers/base.js'

/**
 * Core roadmap types for cards, columns, providers, and operations.
 *
 * @example
 * ```ts
 * import { getProvider, type CreateCardInput } from '@robojs/roadmap';
 *
 * const input: CreateCardInput = {
 *   title: 'New feature',
 *   column: 'Backlog',
 *   labels: ['enhancement']
 * };
 * const result = await getProvider().createCard(input);
 * ```
 */
export type {
	CreateCardInput,
	CreateCardResult,
	DateRangeFilter,
	ProviderConfig,
	ProviderInfo,
	RoadmapCard,
	RoadmapColumn,
	SyncResult,
	UpdateCardInput,
	UpdateCardResult
} from './types.js'

/**
 * Ensures all provider-related exports remain discoverable from the package root.
 */
export * from './providers/base.js'

/**
 * Built-in Jira provider for Jira Cloud roadmaps.
 *
 * @example
 * ```ts
 * import { JiraProvider } from '@robojs/roadmap';
 *
 * const provider = new JiraProvider({
 *   type: 'jira',
 *   options: {
 *     url: process.env.JIRA_URL,
 *     email: process.env.JIRA_EMAIL,
 *     apiToken: process.env.JIRA_API_TOKEN
 *   }
 * });
 * ```
 */
export { JiraProvider, type JiraProviderConfig } from './providers/jira.js'

/**
 * Guild-specific roadmap settings (persistent storage via Flashcore).
 *
 * @example
 * ```ts
 * import { getSettings, updateSettings, getColumnMapping, setColumnMapping } from '@robojs/roadmap';
 *
 * const settings = getSettings(guildId);
 * updateSettings(guildId, { isPublic: true });
 * 
 * // Column mapping
 * setColumnMapping(guildId, 'QA', 'Development');
 * const mapping = getColumnMapping(guildId);
 * ```
 */
export * from './core/settings.js'

/**
 * Discord forum channel management (creation, permissions, tags).
 *
 * @example
 * ```ts
 * import { createOrGetRoadmapCategory, toggleForumAccess } from '@robojs/roadmap';
 *
 * const { category, forums } = await createOrGetRoadmapCategory({ guild, columns });
 * await toggleForumAccess(guild, 'public');
 * ```
 */
export {
	toggleForumAccess,
	getAllForumChannels,
	createOrGetRoadmapCategory,
	getForumChannelForColumn,
	getRoadmapCategory,
	updateForumTagsForColumn,
	type CreateRoadmapForumsOptions,
	type ForumPermissionMode
} from './core/forum-manager.js'

/**
 * Internal constants (component IDs, namespaces).
 *
 * @example
 * ```ts
 * import { ID_NAMESPACE, Buttons } from '@robojs/roadmap';
 *
 * if (interaction.customId === Buttons.TogglePublic.id) {
 *   // Handle toggle
 * }
 * ```
 */
export * from './core/constants.js'

/**
 * Sync engine to orchestrate provider-to-Discord roadmap updates (idempotent).
 *
 * @example
 * ```ts
 * import { syncRoadmap } from '@robojs/roadmap';
 *
 * const result = await syncRoadmap({ guild, provider });
 * console.log(`Synced ${result.stats.total} cards`);
 * ```
 *
 * @example
 * ```ts
 * import { syncSingleCard } from '@robojs/roadmap';
 *
 * const result = await syncSingleCard(card, guild, provider);
 * if (result) {
 *   const { threadId, threadUrl } = result;
 *   await interaction.reply(`Created: ${threadUrl}`);
 * }
 * ```
 *
 * @example
 * ```ts
 * // Dry run
 * await syncRoadmap({ guild, provider, dryRun: true });
 * ```
 */
export * from './core/sync-engine.js'

/**
 * Convenience helpers for date range filtering (last month, last week, last N days, custom range).
 *
 * @example
 * ```ts
 * import { getCardsFromLastMonth, getCardsFromLastDays } from '@robojs/roadmap';
 *
 * const lastMonth = await getCardsFromLastMonth(provider);
 * const last30Days = await getCardsFromLastDays(provider, 30);
 * ```
 */
export * from './core/date-helpers.js'

/**
 * Plugin initialization and provider access.
 *
 * @example
 * ```ts
 * import { getProvider, isProviderReady } from '@robojs/roadmap';
 *
 * if (isProviderReady()) {
 *   const provider = getProvider();
 *   const cards = await provider.fetchCards();
 * }
 * ```
 */
export { getProvider, isProviderReady, options } from './events/_start.js'
export type { RoadmapPluginOptions } from './events/_start.js'
