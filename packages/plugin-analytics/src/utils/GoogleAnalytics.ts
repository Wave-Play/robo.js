import { BaseEngine, EventOptions, ViewOptions } from './analytics'
import { logger } from 'robo.js'

export class GoogleAnalytics extends BaseEngine {
	private _MEASURE_ID = process.env.GOOGLE_ANALYTICS_MEASURE_ID
	private _TOKEN = process.env.GOOGLE_ANALYTICS_SECRET

	public async view(page: string, options: ViewOptions): Promise<void> {
		if (isRequestValid(this._MEASURE_ID, this._TOKEN, options)) {
			if (typeof options.data === 'object' && options.name === 'pageview') {
				const res = await fetch(
					`https://www.google-analytics.com/mp/collect?measurement_id=${this._MEASURE_ID}&api_secret=${this._TOKEN}`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							client_id: options.userID, // Unique user identifier
							events: [{ name: options.name, params: options.data }]
						})
					}
				)

				if (!res.ok) {
					throw new Error(`[GoogleAnalytics] ${res.statusText} ${res.status}`)
				}
			}
		}
	}
	public async event(options: EventOptions): Promise<void> {
		if (isRequestValid(this._MEASURE_ID, this._TOKEN, options)) {
			if (typeof options.data === 'object' && options.name !== 'pageview') {
				const res = await fetch(
					`https://www.google-analytics.com/mp/collect?measurement_id=${this._MEASURE_ID}&api_secret=${this._TOKEN}`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							client_id: options.userID,
							events: [{ name: options.name, params: options.data }]
						})
					}
				)
				if (!res.ok) {
					throw new Error(`[GoogleAnalytics] ${res.statusText} ${res.status}`)
				}
			}
		}
	}
}

function isRequestValid(
	id: string | undefined,
	token: string | undefined,
	options: EventOptions | ViewOptions
): boolean {
	if (!options?.action) {
		logger.error('[GoogleAnalytics] please set an Event : ')
		logger.debug('pageview, event, transaction, item, social, timing, exception')
		return false
	}

	if (!options?.type) {
		logger.error('[GoogleAnalytics] please set the type of interaction, ex: button')
		return false
	}
	if (!options?.actionType) {
		logger.error('[GoogleAnalytics] please set an action Type, ex: click')
		return false
	}
	if (!options.userID) {
		logger.error('[GoogleAnalytics] Please set the user ID.')
		return false
	}
	if (!id) {
		logger.error("[GoogleAnalytics please set the 'process.env.GOOGLE_ANALYTICS_MEASURE_ID' enviromnent variable. ")
		return false
	}
	if (!token) {
		logger.error("[GoogleAnalytics please set the 'process.env.GOOGLE_ANALYTICS_SECRET' enviromnent variable. ")
		return false
	}

	return true
}

// function isGoogleParam(option: unknown): option is { name: string; params: Record<string, unknown> } {
// 	return option.name !== undefined && option.params !== undefined
// }

/**
 * 
 * events: [
				{
					name: options.actionType, // Event name
					params: {
						button_id: options.name, // Any custom parameters you want to track
						engagement_time_msec: 100 // Optional: time user engaged with the button
					}
				}
			]
 */
