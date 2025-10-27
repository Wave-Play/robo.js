/**
 * Convenience helpers for common date range filtering operations.
 */

import type { RoadmapProvider } from '../providers/base.js'
import type { RoadmapCard, DateRangeFilter } from '../types.js'
import { roadmapLogger } from './logger.js'

/**
 * Fetches cards from the previous calendar month.
 *
 * @param provider - The roadmap provider instance.
 * @param dateField - The date field to filter on (defaults to 'updated').
 * @returns Array of cards from last month.
 * @throws Error if provider is null/undefined or doesn't support date filtering.
 *
 * @example
 * ```typescript
 * const cards = await getCardsFromLastMonth(provider);
 * ```
 */
export async function getCardsFromLastMonth(
	provider: RoadmapProvider,
	dateField: DateRangeFilter['dateField'] = 'updated'
): Promise<readonly RoadmapCard[]> {
	// Validate provider
	if (!provider) {
		roadmapLogger.error('getCardsFromLastMonth: Provider is required (dateField=%s)', dateField)
		throw new Error('Provider is required for date range filtering')
	}

	if (!provider.fetchCardsByDateRange) {
		roadmapLogger.warn('getCardsFromDateRange: Provider does not support date filtering (dateField=%s)', dateField)
		throw new Error('Provider does not support date filtering')
	}

	// Calculate the first day of the previous month
	const now = new Date()
	const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
	// Set to start of day (00:00:00.000)
	startDate.setHours(0, 0, 0, 0)

	// Calculate the last day of the previous month
	const endDate = new Date(now.getFullYear(), now.getMonth(), 0)
	// Set to end of day (23:59:59.999)
	endDate.setHours(23, 59, 59, 999)

	// Build the date range filter
	const filter: DateRangeFilter = {
		startDate,
		endDate,
		dateField
	}

	try {
		return await provider.fetchCardsByDateRange(filter)
	} catch (error) {
		roadmapLogger.error(
			'getCardsFromLastMonth: Provider error (dateField=%s, startDate=%s, endDate=%s): %s',
			dateField,
			startDate.toISOString(),
			endDate.toISOString(),
			(error as Error).message
		)
		throw new Error(`Failed to fetch cards from last month: ${(error as Error).message}`)
	}
}

/**
 * Fetches cards from the last 7 days (inclusive of today).
 *
 * @param provider - The roadmap provider instance.
 * @param dateField - The date field to filter on (defaults to 'updated').
 * @returns Array of cards from the last 7 days.
 * @throws Error if provider is null/undefined or doesn't support date filtering.
 *
 * @example
 * ```typescript
 * const cards = await getCardsFromLastWeek(provider);
 * ```
 */
export async function getCardsFromLastWeek(
	provider: RoadmapProvider,
	dateField: DateRangeFilter['dateField'] = 'updated'
): Promise<readonly RoadmapCard[]> {
	// Validate provider
	if (!provider) {
		roadmapLogger.error('getCardsFromLastWeek: Provider is required (dateField=%s)', dateField)
		throw new Error('Provider is required for date range filtering')
	}

	if (!provider.fetchCardsByDateRange) {
		roadmapLogger.warn('getCardsFromLastWeek: Provider does not support date filtering (dateField=%s)', dateField)
		throw new Error('Provider does not support date filtering')
	}

	// Calculate start date (6 days ago)
	const now = new Date()
	const startDate = new Date(now)
	startDate.setDate(now.getDate() - 6)
	// Set to start of day (00:00:00.000)
	startDate.setHours(0, 0, 0, 0)

	// End date is today
	const endDate = new Date(now)
	// Set to end of day (23:59:59.999)
	endDate.setHours(23, 59, 59, 999)

	// Build the date range filter
	const filter: DateRangeFilter = {
		startDate,
		endDate,
		dateField
	}

	try {
		return await provider.fetchCardsByDateRange(filter)
	} catch (error) {
		roadmapLogger.error(
			'getCardsFromLastWeek: Provider error (dateField=%s, startDate=%s, endDate=%s): %s',
			dateField,
			startDate.toISOString(),
			endDate.toISOString(),
			(error as Error).message
		)
		throw new Error(`Failed to fetch cards from last week: ${(error as Error).message}`)
	}
}

/**
 * Fetches cards from the last N days (inclusive of today).
 *
 * @param provider - The roadmap provider instance.
 * @param days - Number of days to look back (must be positive integer).
 * @param dateField - The date field to filter on (defaults to 'updated').
 * @returns Array of cards from the last N days.
 * @throws Error if days is invalid, provider is null/undefined, or provider doesn't support date filtering.
 *
 * @example
 * ```typescript
 * const cards = await getCardsFromLastDays(provider, 30);
 * ```
 */
export async function getCardsFromLastDays(
	provider: RoadmapProvider,
	days: number,
	dateField: DateRangeFilter['dateField'] = 'updated'
): Promise<readonly RoadmapCard[]> {
	// Validate days parameter
	if (days <= 0 || !Number.isInteger(days)) {
		roadmapLogger.error('getCardsFromLastDays: Days must be a positive integer, received: %s', days)
		throw new Error(`Days must be a positive integer, received: ${days}`)
	}

	// Validate provider
	if (!provider) {
		roadmapLogger.error('getCardsFromLastDays: Provider is required (days=%d, dateField=%s)', days, dateField)
		throw new Error('Provider is required for date range filtering')
	}

	if (!provider.fetchCardsByDateRange) {
		roadmapLogger.error(
			'getCardsFromLastDays: Provider does not support date filtering (days=%d, dateField=%s)',
			days,
			dateField
		)
		throw new Error('Provider does not support date filtering')
	}

	// Calculate start date (days - 1 ago, inclusive of today)
	const now = new Date()
	const startDate = new Date(now)
	startDate.setDate(now.getDate() - (days - 1))
	// Set to start of day (00:00:00.000)
	startDate.setHours(0, 0, 0, 0)

	// End date is today
	const endDate = new Date(now)
	// Set to end of day (23:59:59.999)
	endDate.setHours(23, 59, 59, 999)

	// Build the date range filter
	const filter: DateRangeFilter = {
		startDate,
		endDate,
		dateField
	}

	try {
		return await provider.fetchCardsByDateRange(filter)
	} catch (error) {
		roadmapLogger.error(
			'getCardsFromLastDays: Provider error (days=%d, dateField=%s, startDate=%s, endDate=%s): %s',
			days,
			dateField,
			startDate.toISOString(),
			endDate.toISOString(),
			(error as Error).message
		)
		throw new Error(`Failed to fetch cards from last ${days} days: ${(error as Error).message}`)
	}
}

/**
 * Fetches cards within a custom date range.
 *
 * @param provider - The roadmap provider instance.
 * @param startDate - Start date (Date object or ISO 8601 string).
 * @param endDate - End date (Date object or ISO 8601 string).
 * @param dateField - The date field to filter on (defaults to 'updated').
 * @returns Array of cards within the date range.
 * @throws Error if dates are invalid, start > end, provider is null/undefined, or provider doesn't support date filtering.
 *
 * @example
 * ```typescript
 * const cards = await getCardsFromDateRange(provider, '2025-01-01', '2025-01-31');
 * ```
 */
export async function getCardsFromDateRange(
	provider: RoadmapProvider,
	startDate: Date | string,
	endDate: Date | string,
	dateField: DateRangeFilter['dateField'] = 'updated'
): Promise<readonly RoadmapCard[]> {
	// Convert strings to Date objects if necessary
	const start = typeof startDate === 'string' ? new Date(startDate) : startDate
	const end = typeof endDate === 'string' ? new Date(endDate) : endDate

	// Validate that dates are valid Date objects
	if (isNaN(start.getTime()) || isNaN(end.getTime())) {
		roadmapLogger.error(
			'getCardsFromDateRange: Invalid date(s) provided (startDate=%s, endDate=%s)',
			startDate,
			endDate
		)
		throw new Error(`Invalid date(s) provided: startDate=${startDate}, endDate=${endDate}`)
	}

	// Validate date range (start must be before or equal to end)
	if (start > end) {
		roadmapLogger.error(
			'getCardsFromDateRange: Start date must be before or equal to end date (startDate=%s, endDate=%s)',
			start.toISOString(),
			end.toISOString()
		)
		throw new Error(
			`Start date must be before or equal to end date: startDate=${start.toISOString()}, endDate=${end.toISOString()}`
		)
	}

	// Validate provider
	if (!provider) {
		roadmapLogger.error('getCardsFromDateRange: Provider is required (dateField=%s)', dateField)
		throw new Error('Provider is required for date range filtering')
	}

	if (!provider.fetchCardsByDateRange) {
		roadmapLogger.warn('getCardsFromLastDays: Provider does not support date filtering (dateField=%s)', dateField)
		throw new Error('Provider does not support date filtering')
	}

	// Build the date range filter
	const filter: DateRangeFilter = {
		startDate: start,
		endDate: end,
		dateField
	}

	try {
		return await provider.fetchCardsByDateRange(filter)
	} catch (error) {
		roadmapLogger.error(
			'getCardsFromDateRange: Provider error (dateField=%s, startDate=%s, endDate=%s): %s',
			dateField,
			start.toISOString(),
			end.toISOString(),
			(error as Error).message
		)
		throw new Error(`Failed to fetch cards from date range: ${(error as Error).message}`)
	}
}
