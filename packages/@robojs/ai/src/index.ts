/**
 * @module @robojs/ai
 * @description Central entry point for the {@link https://github.com/robojs/robo.js | Robo.js} AI plugin.
 * Exposes the primary runtime singleton, token usage ledger, error classes, and engine contracts
 * required to integrate conversational and generative AI into Robo-powered bots, activities, and
 * web servers. Import from this module when building custom workflows, extending the AI engine
 * catalog, or composing plugins that depend on shared AI services.
 */

/**
 * Primary interface for accessing conversational, voice, and generative capabilities provided by
 * the AI plugin.
 *
 * The {@link AI} singleton coordinates active engines, orchestrates conversation state, proxies
 * tool and function calls, and exposes convenience helpers for runtime status and usage tracking.
 *
 * @example Basic chat with default engine
 * ```ts
 * import { AI } from '@robojs/ai'
 *
 * const reply = await AI.chatSync({
 *   messages: [
 *     { role: 'system', content: 'You are a helpful Robo assistant.' },
 *     { role: 'user', content: 'Summarize the latest maintenance updates.' }
 *   ]
 * })
 *
 * console.log(reply.text)
 * ```
 *
 * @example Voice session lifecycle
 * ```ts
 * import { AI } from '@robojs/ai'
 *
 * const session = await AI.startVoice({ guildId: '123', channelId: '456' })
 *
 * AI.onVoiceEvent('playback', payload => {
 *   console.log('Streaming audio chunk', payload.delta.sequence)
 * })
 *
 * await AI.stopVoice(session.id)
 * ```
 *
 * @example Tracking token usage
 * ```ts
 * import { AI } from '@robojs/ai'
 *
 * const summary = await AI.getUsageSummary({ window: 'day' })
 * console.log('Prompt tokens in last day', summary.windowTotals.prompt)
 *
 * AI.onUsageEvent('usage.limitReached', event => {
 *   console.warn('Token limit exceeded for', event.breach.model)
 * })
 *
 * AI.onUsageEvent('usage.recorded', event => {
 *   console.log('Token usage recorded:', event.usage.tokens)
 * })
 * ```
 *
 * @example Dynamic channel management
 * ```ts
 * import { AI } from '@robojs/ai'
 *
 * // Whitelist a channel when a specific event occurs
 * AI.addWhitelistChannel('123456789012345678')
 *
 * // Check current whitelist
 * const whitelisted = AI.getWhitelistChannels()
 * ```
 *
 * @remarks Engines perform lazy initialization and some functionality will remain unavailable until
 * {@link AI.isReady | AI.isReady()} resolves `true`. For custom engines, use {@link BaseEngine} to
 * participate in the lifecycle hooks.
 *
 * @see BaseEngine
 * @see tokenLedger
 */
export { AI } from './core/ai.js'

/**
 * Token accounting subsystem that records usage across engines, enforces configurable limits, and
 * exposes aggregated summaries for dashboards or billing reconciliation.
 *
 * @example Recording usage manually
 * ```ts
 * import { tokenLedger } from '@robojs/ai'
 *
 * await tokenLedger.recordUsage({
 *   model: 'gpt-4o',
 *   prompt: 512,
 *   completion: 768,
 *   context: { guildId: '123', userId: '456' }
 * })
 * ```
 *
 * @example Configuring limits with alerts
 * ```ts
 * import { tokenLedger } from '@robojs/ai'
 *
 * tokenLedger.configure({
 *   limits: [
 *     { window: 'day', mode: 'block', maxTokens: 25_000, models: ['gpt-4o'] }
 *   ]
 * })
 *
 * const summary = await tokenLedger.getSummary({ window: 'day' })
 * console.log(summary.windowTotals)
 * ```
 *
 * @see TokenLimitError
 */
export { tokenLedger, TokenLimitError } from './core/token-ledger.js'

/**
 * Convenience re-export for the base engine contract and related interfaces. Extend
 * {@link BaseEngine} to implement custom providers or inspection tooling while preserving typing
 * parity with the built-in engines shipped by the AI plugin.
 *
 * @see './engines/base.js'
 */
export * from './engines/base.js'

/**
 * Type-only exports describing AI plugin bootstrap options and usage telemetry wiring. Import when
 * authoring plugin entry points or registering lifecycle hooks within Robo projects.
 */
export type { PluginOptions, PluginUsageOptions } from './events/_start.js'

/**
 * Token ledger type definitions covering configuration, query, and event payload surfaces. Combine
 * these types with {@link tokenLedger} helpers to build observability dashboards or limit management
 * interfaces without importing internal modules.
 */
export type {
	TokenLimitBreach,
	TokenLimitConfig,
	TokenLimitRule,
	TokenRecordOptions,
	TokenRecordResult,
	TokenSummaryQuery,
	TokenSummaryResult,
	TokenUsageEntry,
	TokenWindow,
	TokenWindowTotals,
	TokenSummaryWindow,
	TokenLedgerConfiguration,
	TokenLedgerHooks,
	TokenLimitMode,
	TokenLimitState,
	TokenLimitErrorContext,
	UsageEventListener,
	UsageEventName,
	UsageLimitEvent,
	UsageRecordedEvent
} from './core/token-ledger.js'

export type { ChatReply } from './core/chat/types.js'
