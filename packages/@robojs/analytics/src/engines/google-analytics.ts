import { color } from 'robo.js'
import { analyticsLogger } from '../core/loggers.js'
import { BaseEngine } from './base.js'
import type { EventOptions, ViewOptions } from './base.js'

interface GoogleAnalyticsOptions {
	measureId: string
	token: string
}

// Constants
const Host = 'https://www.google-analytics.com'
const Prefix = color.dim('[GoogleAnalytics]')

export class GoogleAnalytics extends BaseEngine {
	private _measureId: string
	private _token: string

	constructor(options?: GoogleAnalyticsOptions) {
		super()

		this._measureId = options?.measureId ?? process.env.GOOGLE_ANALYTICS_MEASURE_ID!
		this._token = options?.token ?? process.env.GOOGLE_ANALYTICS_SECRET!

		if (this.verifyRequest()) {
			analyticsLogger.ready(color.bold('Google Analytics'), 'is ready to collect data.')
		}
	}

	public async event(name: string, options?: EventOptions) {
		analyticsLogger.debug(Prefix, `Collecting event ${name}${options ? ' with options' : ''}...`, options ?? '')

		// Verify if the request is valid
		if (!this.verifyRequest()) {
			return
		}

		// Set the params
		const params = options?.data ?? {}

		if (options?.revenue) {
			Object.assign(params, options.revenue)
		}

		// Collect the event
		await this.collect({
			client_id: options?.sessionId ?? randomId(),
			user_id: options?.userId,
			events: [{ name, params }]
		})
	}

	public async view(page: string, options?: ViewOptions) {
		analyticsLogger.debug(Prefix, `Collecting page view ${page}${options ? ' with options' : ''}...`, options ?? '')

		// Verify if the request is valid
		if (!this.verifyRequest()) {
			return
		}

		// Set the params
		const event = {
			name: 'page_view',
			params: {
				page_title: page,
				...(options?.data ?? {})
			}
		}

		// Send the request
		await this.collect({
			client_id: options?.sessionId ?? randomId(),
			user_id: options?.userId,
			events: [event]
		})
	}

	private async collect(payload: unknown) {
		// Send the request
		const response = await fetch(Host + `/mp/collect?measurement_id=${this._measureId}&api_secret=${this._token}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(payload)
		})

		// Log the error if the request fails
		if (!response.ok) {
			analyticsLogger.error(Prefix, response.statusText, response.status)
		} else {
			analyticsLogger.debug(Prefix, 'Event collected successfully:', payload)
		}
	}

	private verifyRequest() {
		if (!this._measureId) {
			analyticsLogger.warn(Prefix, 'Missing GOOGLE_ANALYTICS_MEASURE_ID enviromnent variable.')
			return false
		}

		if (!this._token) {
			analyticsLogger.warn(Prefix, 'Missng GOOGLE_ANALYTICS_SECRET enviromnent variable.')
			return false
		}

		return true
	}
}

function randomId() {
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}
