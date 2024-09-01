import { BaseEngine, EventOptions, ViewOptions } from './analytics'
import { logger } from 'robo.js'

export class GoogleAnalytics extends BaseEngine {
	private _MEASURE_ID = process.env.GOOGLE_ANALYTICS_MEASURE_ID
	private _TOKEN = process.env.GOOGLE_ANALYTICS_SECRET

	public async view(page: string, options: ViewOptions): Promise<void> {
		if (isRequestValid(this._MEASURE_ID, this._TOKEN, options)) {
			if (typeof options.data === 'object') {
				const params = {}

				if (options.data) {
					Object.assign(params, options.data)
				}
				if (options.revenue) {
					Object.assign(params, options.revenue)
				}
				const res = await fetch(
					`https://www.google-analytics.com/mp/collect?measurement_id=${this._MEASURE_ID}&api_secret=${this._TOKEN}`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							client_id: options.userID, // Unique user identifier
							events: [{ name: options.name, params }]
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
			if (options.name === 'pageview') {
				throw new Error(`[GoogleAnalytics] Please use pageview event with the Analytics.view() method`)
			}
			if (typeof options.data === 'object') {
				const params = {}

				if (options.data) {
					Object.assign(params, options.data)
				}
				if (options.revenue) {
					Object.assign(params, options.revenue)
				}

				const res = await fetch(
					`https://www.google-analytics.com/mp/collect?measurement_id=${this._MEASURE_ID}&api_secret=${this._TOKEN}`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json'
						},
						body: JSON.stringify({
							client_id: options.userID,
							events: [{ name: options.name, params }]
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
	if (!options.name) {
		logger.error('[GoogleAnalytics] Please set a name for your event.')
		return false
	}
	if (!options.userID) {
		logger.error('[GoogleAnalytics] Please set a user ID.')
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
