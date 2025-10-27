/**
 * Token usage tracking subsystem for the Robo AI plugin. Provides persistence, aggregation,
 * configurable limits, and event notifications for monitoring and enforcing model consumption
 * across channels, guilds, and custom workflows.
 */
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { Flashcore } from 'robo.js'
import { _PREFIX } from '@/core/constants.js'

const TOKEN_NAMESPACE = _PREFIX + 'tokens'
const AGGREGATE_KEY = 'aggregates'
const ENTRY_PREFIX = 'entries:'

const emitter = new EventEmitter()
emitter.setMaxListeners(0)

/** Sliding windows used when summarizing token usage. */
export type TokenSummaryWindow = 'day' | 'week' | 'month'

/**
 * Token window identifiers including lifetime totals for aggregate queries.
 */
export type TokenWindow = TokenSummaryWindow | 'lifetime'

/**
 * Aggregate token counts for a given window.
 */
export interface TokenWindowTotals {
	/** Prompt tokens consumed during the window. */
	tokensIn: number
	/** Completion tokens produced during the window. */
	tokensOut: number
	/** Combined prompt and completion tokens. */
	total: number
	/** Last time the totals were updated, represented as a UNIX timestamp. */
	updatedAt: number
}

/**
 * Individual token usage record persisted to Flashcore.
 */
export interface TokenUsageEntry {
	/** Unique identifier assigned to the usage entry. */
	id: string
	/** Model for which tokens were consumed. */
	model: string
	/** Number of prompt tokens recorded. */
	tokensIn: number
	/** Number of completion tokens recorded. */
	tokensOut: number
	/** Combined total tokens. */
	total: number
	/** Timestamp (ms) when the usage occurred. */
	createdAt: number
	/** Optional metadata for downstream analytics. */
	metadata?: Record<string, unknown>
	/** Optional usage category describing the request. */
	kind?: string
}

interface TokenWindowUpdate {
	windowKey: string
	previousTotals: TokenWindowTotals
	totals: TokenWindowTotals
}

interface UsageTotalsSnapshot {
	lifetime: {
		previousTotals: TokenWindowTotals
		totals: TokenWindowTotals
	}
	windows: Record<TokenSummaryWindow, TokenWindowUpdate | null>
}

/** Mode applied when a usage limit is reached. */
export type TokenLimitMode = 'warn' | 'block'

/**
 * Configuration describing a single token limit rule.
 */
export interface TokenLimitRule {
	/** Sliding window in which the limit is evaluated. */
	window: TokenSummaryWindow
	/** Maximum tokens allowed within the window. */
	maxTokens: number
	/**
	 * Enforcement mode. Use `block` to throw {@link TokenLimitError}, or `warn` to emit events
	 * without blocking execution.
	 */
	mode?: TokenLimitMode
	/** Optional message surfaced when the limit is exceeded. */
	message?: string
}

/**
 * Token limit configuration keyed by model identifier.
 */
export interface TokenLimitConfig {
	/** Mapping of model names to limit rules. */
	perModel?: Record<string, TokenLimitRule>
}

/**
 * Snapshot describing how a limit was breached.
 */
export interface TokenLimitBreach {
	/** Model that triggered the breach. */
	model: string
	/** Window in which the limit was exceeded. */
	window: TokenSummaryWindow
	/** Window key (e.g., ISO day or ISO week) identifying the period. */
	windowKey: string
	/** Configured maximum tokens for the window. */
	maxTokens: number
	/** Total prior to the latest usage being recorded. */
	previousTotal: number
	/** New total after recording the usage. */
	total: number
	/** Tokens beyond the configured limit. */
	exceededBy: number
	/** Tokens remaining before the latest update. */
	remainingBefore: number
	/** Enforcement mode active for the breach. */
	mode: TokenLimitMode
	/** Message defined by the rule, if any. */
	message?: string
}

/**
 * Event payload describing recorded usage and updated totals.
 */
export interface UsageRecordedEvent {
	/** Usage entry that was persisted. */
	entry: TokenUsageEntry
	/** Model associated with the recorded usage. */
	model: string
	/** Updated totals including lifetime and window snapshots. */
	totals: UsageTotalsSnapshot
}

/**
 * Event payload emitted when usage breaches at least one limit.
 */
export interface UsageLimitEvent extends UsageRecordedEvent {
	/** Collection of breached limit descriptors. */
	breaches: TokenLimitBreach[]
}

/**
 * Options accepted by {@link recordUsage} when logging token consumption.
 */
export interface TokenRecordOptions {
	/** Model identifier being charged. */
	model: string
	/** Prompt tokens to record. */
	tokensIn?: number
	/** Completion tokens to record. */
	tokensOut?: number
	/** Additional metadata, such as guild or user identifiers. */
	metadata?: Record<string, unknown>
	/** Override timestamp for backfilled events. */
	timestamp?: number
	/** Optional usage classification. */
	kind?: string
}

/**
 * Response returned after successfully recording usage.
 */
export interface TokenRecordResult {
	/** Persisted usage entry. */
	entry: TokenUsageEntry
	/** Updated totals snapshot after recording the entry. */
	totals: UsageTotalsSnapshot
	/** Breaches triggered by the usage operation. */
	breaches: TokenLimitBreach[]
}

interface TokenSummaryRow {
	model: string
	window: TokenWindow
	windowKey: string
	totals: TokenWindowTotals
	timestamp: number
}

/**
 * Parameters controlling usage summary retrieval.
 */
export interface TokenSummaryQuery {
	/** Filter results to a specific model. */
	model?: string
	/** Window to aggregate by; defaults to `day`. */
	window?: TokenWindow
	/** Timestamp range filter (milliseconds). */
	range?: {
		/** Inclusive lower bound timestamp. */
		from?: number
		/** Inclusive upper bound timestamp. */
		to?: number
	}
	/** Pagination cursor returned from prior results. */
	cursor?: string
	/** Maximum number of rows to return (1-500). */
	limit?: number
}

/**
 * Result structure produced by {@link getSummary}.
 */
export interface TokenSummaryResult {
	/** Window that was aggregated. */
	window: TokenWindow
	/** Aggregated rows grouped by model and window key. */
	results: Array<{
		/** Model name represented by the row. */
		model: string
		/** Window key (ISO date/week/month or lifetime). */
		windowKey: string
		/** Token totals for the row. */
		totals: TokenWindowTotals
	}>
	/** Pagination cursor for fetching subsequent results. */
	nextCursor?: string
}

/**
 * Optional hook callbacks invoked during ledger operations.
 */
export interface TokenLedgerHooks {
	/** Called after usage is recorded and aggregates are updated. */
	onRecorded?: (payload: UsageRecordedEvent) => void | Promise<void>
	/** Called when usage breaches a configured limit. */
	onLimitReached?: (payload: UsageLimitEvent) => void | Promise<void>
}

/**
 * Configuration object applied when initializing or reconfiguring the ledger.
 */
export interface TokenLedgerConfiguration {
	/** Limit rules to enforce. */
	limits?: TokenLimitConfig
	/** Hook callbacks for reacting to ledger events. */
	hooks?: TokenLedgerHooks
}

/**
 * Snapshot describing the real-time state of token limits for a model.
 */
export interface TokenLimitState {
	/** Model identifier. */
	model: string
	/** Per-window state including remaining tokens and current window key. */
	windows: Record<
		TokenSummaryWindow,
		{
			/** Tokens remaining in the window before breaching the rule. */
			remaining: number
			/** Active window key (ISO date/week/month). */
			windowKey: string
			/** Tokens consumed in the current window. */
			total: number
		}
	>
	/** Indicates whether requests should be blocked under the configured rule. */
	blocked: boolean
	/** Active rule applied to the model, if one exists. */
	rule?: TokenLimitRule
	/** Optional message derived from the active rule. */
	message?: string
}

/** Mapping of usage event names to payloads. */
export type UsageEventPayloads = {
	'usage.recorded': UsageRecordedEvent
	'usage.limitReached': UsageLimitEvent
}

/** Usage event identifiers emitted by the ledger. */
export type UsageEventName = keyof UsageEventPayloads

/** Listener signature for ledger usage events. */
export type UsageEventListener<T extends UsageEventName> = (payload: UsageEventPayloads[T]) => void | Promise<void>

type TokenWindowMap = Record<TokenSummaryWindow, Record<string, TokenWindowTotals>>

interface ModelAggregate {
	lifetime: TokenWindowTotals
	windows: TokenWindowMap
}

type AggregateStore = Record<string, ModelAggregate>

let aggregatesCache: AggregateStore | null = null
let limitsConfig: TokenLimitConfig = {}
let hookDisposers: Array<() => void> = []

const EMPTY_TOTALS: TokenWindowTotals = Object.freeze({
	tokensIn: 0,
	tokensOut: 0,
	total: 0,
	updatedAt: 0
})

/**
 * Creates a shallow copy of the provided totals, falling back to an empty totals object when the
 * source is undefined. This avoids mutating cached references while maintaining default values.
 */
function cloneTotals(totals?: TokenWindowTotals): TokenWindowTotals {
	if (!totals) {
		return { ...EMPTY_TOTALS }
	}

	return { ...totals }
}

/**
 * Constructs a {@link TokenWindowTotals} instance with optional initial values, ensuring all
 * numeric fields default to zero so callers can safely increment totals without guards.
 */
function createTotals(initial?: Partial<TokenWindowTotals>): TokenWindowTotals {
	return {
		tokensIn: initial?.tokensIn ?? 0,
		tokensOut: initial?.tokensOut ?? 0,
		total: initial?.total ?? 0,
		updatedAt: initial?.updatedAt ?? 0
	}
}

/**
 * Builds a {@link ModelAggregate} with lifetime totals and empty window maps for each summary
 * window. Each window map is created without a prototype to avoid inheriting Object helpers.
 */
function createModelAggregate(): ModelAggregate {
	return {
		lifetime: createTotals(),
		windows: {
			day: Object.create(null),
			week: Object.create(null),
			month: Object.create(null)
		}
	}
}

/**
 * Produces a deep clone of the aggregate store, allowing safe mutation without affecting cached
 * references. When the store is empty, a new object literal is returned.
 */
function cloneAggregates(store?: AggregateStore | null): AggregateStore {
	if (!store) {
		return {}
	}

	return JSON.parse(JSON.stringify(store)) as AggregateStore
}

/**
 * Validates the value retrieved from Flashcore, ensuring it is an object before casting it to an
 * {@link AggregateStore}. Non-object values indicate uninitialized storage and result in an empty
 * store.
 */
function normalizeAggregates(value: unknown): AggregateStore {
	if (!value || typeof value !== 'object') {
		return {}
	}

	return value as AggregateStore
}

/**
 * Aggregates the provided token counts into an existing totals object, updating prompt, completion,
 * and combined totals alongside the last-updated timestamp.
 */
function updateTotals(
	prev: TokenWindowTotals | undefined,
	tokensIn: number,
	tokensOut: number,
	timestamp: number
): TokenWindowTotals {
	const totals = prev ? { ...prev } : createTotals()
	totals.tokensIn += tokensIn
	totals.tokensOut += tokensOut
	totals.total += tokensIn + tokensOut
	totals.updatedAt = Math.max(timestamp, totals.updatedAt)

	return totals
}

/**
 * Derives the ISO day window key (YYYY-MM-DD) used for day-level aggregations.
 */
function getDayKey(date: Date): string {
	// Extract YYYY-MM-DD from ISO string

	return date.toISOString().slice(0, 10)
}

/**
 * Derives the ISO month window key (YYYY-MM) used for month-level aggregations.
 */
function getMonthKey(date: Date): string {
	// Format as YYYY-MM with zero-padded month

	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Calculates the ISO 8601 week number and corresponding year for the provided date. The algorithm
 * normalizes the date to UTC, uses the Thursday indicator to determine the ISO week year, and then
 * counts the weeks offset from the year's first Thursday.
 */
function getIsoWeek(date: Date): { year: number; week: number } {
	const temp = new Date(date)
	temp.setUTCHours(0, 0, 0, 0)
	// ISO weeks start on Monday; Thursday determines the year
	temp.setUTCDate(temp.getUTCDate() + 3 - ((temp.getUTCDay() + 6) % 7))
	const year = temp.getUTCFullYear()
	// Week 1 contains January 4th
	const firstThursday = new Date(Date.UTC(year, 0, 4))
	// Calculate week offset from first Thursday
	const week = 1 + Math.round(((temp.getTime() - firstThursday.getTime()) / 86400000 - 3) / 7)

	return { year, week }
}

/**
 * Formats the ISO week number and year into the canonical window key (YYYY-Wnn).
 */
function getWeekKey(date: Date): string {
	const { year, week } = getIsoWeek(date)

	return `${year}-W${String(week).padStart(2, '0')}`
}

/**
 * Calculates the UTC timestamp for the Monday that starts the specified ISO week.
 */
function startOfIsoWeek(year: number, week: number): Date {
	const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7))
	// Find the day of week for the simple date
	const dayOfWeek = simple.getUTCDay()
	// Calculate offset to reach Monday (day 1)
	const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
	simple.setUTCDate(simple.getUTCDate() + diff)
	simple.setUTCHours(0, 0, 0, 0)

	return simple
}

/**
 * Converts a window key back into a UNIX timestamp representing the start of that window. The
 * timestamp is used for sorting, filtering, and pagination across aggregate queries.
 */
function windowKeyToTimestamp(window: TokenSummaryWindow, key: string): number {
	if (window === 'day') {
		// Parse ISO date string directly

		return Date.parse(`${key}T00:00:00Z`)
	}

	if (window === 'month') {
		const [year, month] = key.split('-').map(Number)
		if (!year || !month) {
			return NaN
		}

		// Extract year and month, construct UTC timestamp

		return Date.UTC(year, month - 1, 1)
	}

	const [yearPart, weekPart] = key.split('-W')
	const year = Number(yearPart)
	const week = Number(weekPart)
	if (!year || !week) {
		return NaN
	}

	// Parse ISO week format and calculate Monday start

	return startOfIsoWeek(year, week).getTime()
}

/**
 * Lazily loads aggregates from Flashcore into the in-memory cache. Subsequent calls reuse the
 * cached instance until it is explicitly replaced via {@link setAggregatesCache}.
 */
async function ensureAggregates(): Promise<AggregateStore> {
	if (!aggregatesCache) {
		const stored = await Flashcore.get<AggregateStore>(AGGREGATE_KEY, {
			namespace: TOKEN_NAMESPACE
		})
		aggregatesCache = normalizeAggregates(stored)
	}

	return aggregatesCache
}

/**
 * Replaces the in-memory aggregate cache. Used after mutations so future reads observe updated
 * state without hitting persistent storage.
 */
function setAggregatesCache(store: AggregateStore) {
	aggregatesCache = store
}

/**
 * Appends a usage entry to the per-day Flashcore log used for playback and audits.
 */
async function appendEntry(dayKey: string, entry: TokenUsageEntry) {
	const key = ENTRY_PREFIX + dayKey
	const existing = await Flashcore.get<TokenUsageEntry[]>(key, { namespace: TOKEN_NAMESPACE })
	// Append to existing entries or create new array
	const next: TokenUsageEntry[] = Array.isArray(existing) ? [...existing, entry] : [entry]
	await Flashcore.set<TokenUsageEntry[]>(key, next, { namespace: TOKEN_NAMESPACE })
}

/**
 * Evaluates configured limit rules for a model given updated window snapshots, returning any
 * breaches that should be surfaced to callers.
 */
function applyLimits(
	model: string,
	windowSnapshots: Record<TokenSummaryWindow, TokenWindowUpdate | null>
): TokenLimitBreach[] {
	const perModel = limitsConfig.perModel ?? {}
	// Look up limit rule for this model
	const rule = perModel[model]
	if (!rule) {
		return []
	}
	// Verify we have updated totals for the rule's window
	const snapshot = windowSnapshots[rule.window]
	if (!snapshot) {
		return []
	}
	const newTotal = snapshot.totals.total
	// Check if new total exceeds the configured limit
	if (newTotal <= rule.maxTokens) {
		return []
	}
	const previousTotal = snapshot.previousTotals.total

	// Construct breach descriptor with all context
	return [
		{
			model,
			window: rule.window,
			windowKey: snapshot.windowKey,
			maxTokens: rule.maxTokens,
			previousTotal,
			total: newTotal,
			exceededBy: newTotal - rule.maxTokens,
			remainingBefore: Math.max(0, rule.maxTokens - previousTotal),
			mode: rule.mode ?? 'warn',
			message: rule.message
		}
	]
}

/**
 * Records token consumption for a model, persists the entry, and updates cached aggregates.
 *
 * @param options Usage details including model, token counts, and optional metadata.
 * @returns Snapshot containing the persisted entry, updated totals, and limit breaches.
 * @example Recording usage for a scheduled job
 * ```ts
 * await recordUsage({ model: 'gpt-4o-mini', tokensIn: 1200, tokensOut: 800, metadata: { job: 'daily-digest' } })
 * ```
 */
export async function recordUsage(options: TokenRecordOptions): Promise<TokenRecordResult | null> {
	const tokensIn = Math.max(0, Math.floor(options.tokensIn ?? 0))
	const tokensOut = Math.max(0, Math.floor(options.tokensOut ?? 0))
	const total = tokensIn + tokensOut
	if (!options.model || total === 0) {
		return null
	}

	const timestamp = options.timestamp ?? Date.now()
	const date = new Date(timestamp)
	const dayKey = getDayKey(date)
	const weekKey = getWeekKey(date)
	const monthKey = getMonthKey(date)

	const aggregates = await ensureAggregates()
	const store = cloneAggregates(aggregates)
	const modelAggregate = store[options.model] ?? createModelAggregate()
	const previousLifetime = cloneTotals(modelAggregate.lifetime)
	const updatedLifetime = updateTotals(modelAggregate.lifetime, tokensIn, tokensOut, timestamp)
	modelAggregate.lifetime = updatedLifetime

	const windows: TokenWindowMap = modelAggregate.windows
	const windowSnapshots: Record<TokenSummaryWindow, TokenWindowUpdate | null> = {
		day: null,
		week: null,
		month: null
	}
	const windowKeyMap: Record<TokenSummaryWindow, string> = {
		day: dayKey,
		week: weekKey,
		month: monthKey
	}
	for (const window of Object.keys(windowKeyMap) as TokenSummaryWindow[]) {
		const key = windowKeyMap[window]
		const map = windows[window]
		const previous = cloneTotals(map[key])
		const updated = updateTotals(map[key], tokensIn, tokensOut, timestamp)
		map[key] = updated
		windowSnapshots[window] = {
			windowKey: key,
			previousTotals: previous,
			totals: updated
		}
	}

	store[options.model] = {
		lifetime: updatedLifetime,
		windows
	}
	setAggregatesCache(store)
	await Flashcore.set(AGGREGATE_KEY, store, { namespace: TOKEN_NAMESPACE })

	const entry: TokenUsageEntry = {
		id: randomUUID(),
		model: options.model,
		tokensIn,
		tokensOut,
		total,
		createdAt: timestamp,
		metadata: options.metadata,
		kind: options.kind
	}
	await appendEntry(dayKey, entry)

	const totalsSnapshot: UsageTotalsSnapshot = {
		lifetime: {
			previousTotals: previousLifetime,
			totals: updatedLifetime
		},
		windows: windowSnapshots
	}
	const breaches = applyLimits(options.model, windowSnapshots)

	const recordEvent: UsageRecordedEvent = {
		entry,
		model: options.model,
		totals: totalsSnapshot
	}
	emitter.emit('usage.recorded', recordEvent)
	if (breaches.length > 0) {
		emitter.emit('usage.limitReached', {
			...recordEvent,
			breaches
		})
	}

	return {
		entry,
		totals: totalsSnapshot,
		breaches
	}
}

/**
 * Retrieves lifetime token totals for all models or a specific model.
 */
export async function getLifetimeTotals(model?: string): Promise<Record<string, TokenWindowTotals>> {
	const aggregates = await ensureAggregates()
	if (model) {
		const aggregate = aggregates[model]

		return aggregate ? { [model]: cloneTotals(aggregate.lifetime) } : {}
	}

	return Object.fromEntries(
		Object.entries(aggregates).map(([modelName, aggregate]) => [modelName, cloneTotals(aggregate.lifetime)])
	)
}

/**
 * Summarizes usage across configured windows with optional model, range, and pagination filters.
 *
 * @param query Summary parameters controlling model filtering, pagination, and window selection.
 * @returns Aggregated usage rows paired with the next cursor when available.
 * @example Fetching the latest weekly totals
 * ```ts
 * const summary = await getSummary({ window: 'week', limit: 10 })
 * ```
 */
export async function getSummary(query: TokenSummaryQuery = {}): Promise<TokenSummaryResult> {
	const aggregates = await ensureAggregates()
	const window = query.window ?? 'day'
	const limit = Math.max(1, Math.min(query.limit ?? 50, 500))
	const modelFilter = query.model ? [query.model] : Object.keys(aggregates)
	const rows: TokenSummaryRow[] = []

	if (window === 'lifetime') {
		for (const modelName of modelFilter) {
			const aggregate = aggregates[modelName]
			if (!aggregate) {
				continue
			}
			rows.push({
				model: modelName,
				window: 'lifetime',
				windowKey: 'lifetime',
				totals: cloneTotals(aggregate.lifetime),
				timestamp: aggregate.lifetime.updatedAt
			})
		}

		return {
			window,
			results: rows.map(({ model, windowKey, totals }) => ({ model, windowKey, totals }))
		}
	}

	const cursorTimestamp = query.cursor ? windowKeyToTimestamp(window as TokenSummaryWindow, query.cursor) : undefined

	for (const modelName of modelFilter) {
		const aggregate = aggregates[modelName]
		if (!aggregate) {
			continue
		}
		const windowMap = aggregate.windows[window as TokenSummaryWindow]
		for (const [key, totals] of Object.entries(windowMap)) {
			const timestamp = windowKeyToTimestamp(window as TokenSummaryWindow, key)
			rows.push({
				model: modelName,
				window,
				windowKey: key,
				totals: cloneTotals(totals),
				timestamp
			})
		}
	}

	let filtered = rows.filter((row) => !Number.isNaN(row.timestamp)).sort((a, b) => b.timestamp - a.timestamp)
	if (typeof query.range?.from === 'number') {
		filtered = filtered.filter((row) => row.timestamp >= query.range!.from!)
	}
	if (typeof query.range?.to === 'number') {
		filtered = filtered.filter((row) => row.timestamp <= query.range!.to!)
	}
	if (cursorTimestamp !== undefined && !Number.isNaN(cursorTimestamp)) {
		filtered = filtered.filter((row) => row.timestamp < cursorTimestamp)
	}
	const limited = filtered.slice(0, limit)
	const nextCursor = filtered.length > limit ? limited[limited.length - 1]?.windowKey : undefined

	return {
		window,
		results: limited.map(({ model, windowKey, totals }) => ({ model, windowKey, totals })),
		nextCursor
	}
}

/**
 * Retrieves all persisted usage entries for the given ISO day key.
 */
export async function getEntriesForDay(dayKey: string): Promise<TokenUsageEntry[]> {
	const entries = await Flashcore.get<TokenUsageEntry[]>(ENTRY_PREFIX + dayKey, {
		namespace: TOKEN_NAMESPACE
	})

	return Array.isArray(entries) ? entries.map((entry) => ({ ...entry })) : []
}

/** Registers a listener for recurring usage events. */
export function on<T extends UsageEventName>(event: T, listener: UsageEventListener<T>) {
	emitter.on(event, listener as (payload: UsageEventPayloads[T]) => void)
}

/** Registers a one-time listener for usage events. */
export function once<T extends UsageEventName>(event: T, listener: UsageEventListener<T>) {
	emitter.once(event, listener as (payload: UsageEventPayloads[T]) => void)
}

/** Removes a usage event listener. */
export function off<T extends UsageEventName>(event: T, listener: UsageEventListener<T>) {
	emitter.off(event, listener as (payload: UsageEventPayloads[T]) => void)
}

/** Retrieves the active limit configuration. */
export function getLimits(): TokenLimitConfig {
	return limitsConfig
}

/** Replaces the active limit configuration. */
export function setLimits(limits?: TokenLimitConfig) {
	limitsConfig = limits ?? {}
}

/**
 * Predicts whether adding the provided tokens would exceed the configured limit.
 *
 * @returns True when the addition would breach a configured rule.
 */
export async function willExceedLimit(model: string, tokens: number, window?: TokenSummaryWindow): Promise<boolean> {
	const perModel = limitsConfig.perModel ?? {}
	const rule = perModel[model]
	if (!rule || rule.maxTokens <= 0) {
		return false
	}
	if (window && window !== rule.window) {
		return false
	}
	const aggregates = await ensureAggregates()
	const aggregate = aggregates[model]
	if (!aggregate) {
		return tokens > rule.maxTokens
	}
	const windowMap = aggregate.windows[rule.window]
	const now = new Date()
	const currentKey = getCurrentWindowKey(rule.window, now)
	const currentTotals = windowMap[currentKey]
	const currentTotal = currentTotals?.total ?? 0

	return currentTotal + tokens > rule.maxTokens
}

/** Retrieves the configured limit rule for a model, if present.
 *
 * @returns Limit rule matching the model, if configured.
 */
export function getLimitRule(model: string): TokenLimitRule | undefined {
	const perModel = limitsConfig.perModel ?? {}

	return perModel[model]
}

/**
 * Derives the active window key for the current time based on the window type.
 */
function getCurrentWindowKey(window: TokenSummaryWindow, now: Date): string {
	if (window === 'day') {
		return getDayKey(now)
	}

	if (window === 'week') {
		return getWeekKey(now)
	}

	return getMonthKey(now)
}

/**
 * Computes the real-time limit state for a model, including remaining budget and block status.
 *
 * @returns Per-window remaining tokens and blocking metadata for the model.
 */
export async function getLimitState(model: string): Promise<TokenLimitState> {
	const rule = getLimitRule(model)
	const now = new Date()
	const aggregates = await ensureAggregates()
	const aggregate = aggregates[model]
	const windows = {} as TokenLimitState['windows']

	for (const window of ['day', 'week', 'month'] as const) {
		const windowKey = getCurrentWindowKey(window, now)
		const total = aggregate?.windows?.[window]?.[windowKey]?.total ?? 0
		const remaining = rule && rule.window === window ? Math.max(0, rule.maxTokens - total) : Number.POSITIVE_INFINITY
		windows[window] = {
			remaining,
			windowKey,
			total
		}
	}

	let blocked = false
	if (rule) {
		const ruleWindowState = windows[rule.window]
		const remaining = ruleWindowState ? ruleWindowState.remaining : 0
		blocked = (rule.mode ?? 'warn') === 'block' && remaining <= 0
	}

	return {
		model,
		blocked,
		windows,
		rule,
		message: rule?.message
	}
}

/**
 * Context supplied when constructing a {@link TokenLimitError}.
 *
 * @see TokenLimitError
 */
export interface TokenLimitErrorContext {
	/** Model that triggered the limit breach. */
	model: string
	/** Window where the limit was exceeded. */
	window: TokenSummaryWindow
	/** Active window key for the breach. */
	windowKey: string
	/** Limit rule that was violated. */
	rule: TokenLimitRule
	/** Optional usage classification. */
	usageKind?: string
}

/**
 * Error thrown when a `block` mode limit has been exceeded.
 *
 * @example Handling TokenLimitError when sending a chat reply
 * ```ts
 * try {
 *   await AI.chat(options)
 * } catch (error) {
 *   if (error instanceof TokenLimitError) {
 *     console.warn(error.displayMessage)
 *   }
 * }
 * ```
 *
 * @example Configuring limits that trigger TokenLimitError
 * ```ts
 * tokenLedger.configure({
 *   limits: { perModel: { 'gpt-4o': { window: 'day', maxTokens: 10_000, mode: 'block' } } }
 * })
 * ```
 *
 * @see tokenLedger.configure
 */
export class TokenLimitError extends Error {
	/** Model that exceeded the limit. */
	public readonly model: string
	/** Window in which the error was triggered. */
	public readonly window: TokenSummaryWindow
	/** Window key describing the offending period. */
	public readonly windowKey: string
	/** Rule that caused the error to be thrown. */
	public readonly rule: TokenLimitRule
	/** Optional usage classification for context. */
	public readonly usageKind?: string

	/**
	 * @param context Details describing the breached rule and usage metadata.
	 */
	public constructor(context: TokenLimitErrorContext) {
		const message =
			context.rule.message ??
			`The ${context.rule.window} token limit of ${context.rule.maxTokens.toLocaleString()} for model ${
				context.model
			} has been reached.`
		super(message)
		this.name = 'TokenLimitError'
		this.model = context.model
		this.window = context.window
		this.windowKey = context.windowKey
		this.rule = context.rule
		this.usageKind = context.usageKind
	}

	/** Message suitable for end-user display. */
	get displayMessage(): string {
		return this.message
	}
}

/**
 * Throws {@link TokenLimitError} when the specified model is currently blocked by a limit rule.
 *
 * @param model Model identifier to evaluate.
 * @param usageKind Optional usage category for additional context within the error.
 * @throws TokenLimitError When a `block` mode limit has been exhausted.
 */
export async function assertWithinLimit(model: string, usageKind?: string): Promise<void> {
	const state = await getLimitState(model)
	const rule = state.rule
	if (!rule) {
		return
	}
	if ((rule.mode ?? 'warn') !== 'block') {
		return
	}
	const windowState = state.windows[rule.window]
	if (!windowState) {
		return
	}
	if (windowState.remaining > 0) {
		return
	}
	throw new TokenLimitError({
		model,
		rule,
		window: rule.window,
		windowKey: windowState.windowKey,
		usageKind
	})
}

/**
 * Applies ledger configuration including limit rules and hook subscriptions.
 */
export function configureTokenLedger(configuration: TokenLedgerConfiguration = {}) {
	setLimits(configuration.limits)
	hookDisposers.forEach((dispose) => dispose())
	hookDisposers = []
	if (configuration.hooks?.onRecorded) {
		const handler = configuration.hooks.onRecorded
		on('usage.recorded', handler)
		hookDisposers.push(() => off('usage.recorded', handler))
	}
	if (configuration.hooks?.onLimitReached) {
		const handler = configuration.hooks.onLimitReached
		on('usage.limitReached', handler)
		hookDisposers.push(() => off('usage.limitReached', handler))
	}
}

/**
 * High-level facade exposing token accounting utilities, aggregation helpers, and limit
 * enforcement hooks for the AI plugin.
 *
 * @example Recording usage and observing totals
 * ```ts
 * const result = await tokenLedger.recordUsage({ model: 'gpt-4o', tokensIn: 500, tokensOut: 300 })
 * console.log(result.totals.windows.day?.totals.total)
 * ```
 *
 * @example Querying summaries for dashboards
 * ```ts
 * const summary = await tokenLedger.getSummary({ model: 'gpt-4o', window: 'day' })
 * ```
 *
 * @example Configuring limits with hooks
 * ```ts
 * tokenLedger.configure({
 *   limits: { perModel: { 'gpt-4o': { window: 'day', maxTokens: 50_000, mode: 'warn' } } },
 *   hooks: {
 *     onLimitReached: ({ breaches }) => console.warn(breaches)
 *   }
 * })
 * ```
 *
 * @remarks Aggregates are persisted via Flashcore and cached in-memory for fast read access.
 *
 * @see TokenLimitError
 * @see TokenLimitConfig
 * @see TokenSummaryQuery
 */
export const tokenLedger = {
	configure: configureTokenLedger,
	recordUsage,
	getSummary,
	getLifetimeTotals,
	getEntriesForDay,
	getLimits,
	setLimits,
	willExceedLimit,
	getLimitRule,
	getLimitState,
	assertWithinLimit,
	on,
	once,
	off
}
