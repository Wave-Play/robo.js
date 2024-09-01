import { logger } from 'robo.js'
import { BaseEngine, EventOptions, ViewOptions } from './analytics'

export class PlausibleAnalytics extends BaseEngine {
	private _PLAUSIBLE_DOMAIN = process.env.PLAUSIBLE_DOMAIN

	public async view(page: string, options: ViewOptions): Promise<void> {
		const temp = {
			name: 'pageview',
			url: options?.url ?? `https://${this._PLAUSIBLE_DOMAIN}${page}`,
			domain: options?.domain ?? this._PLAUSIBLE_DOMAIN
		}

		if (typeof options.data === 'object') {
			if (options.data !== null) {
				if (Object.entries(options.data).length > 30) {
					throw new Error('[Plausible] Cannot send an object with more than 30 fields.')
				} else {
					Object.assign(temp, { props: { ...options.data } })
				}
			}
		}

		const res = await fetch('https://plausible.io/api/event', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36'
			},
			referrer: options.referrer ?? '',
			body: JSON.stringify(temp)
		})

		if (res.status !== 202) {
			throw new Error(`[Plausible] ${res.statusText} ${res.status}`)
		}
	}

	public async event(options: EventOptions): Promise<void> {
		if (options.name === 'pageview') {
			return logger.error(`[Plausible]  Please use Analytics.view(${options.name}, ${options}).`)
		}

		if (!options.domain && !this._PLAUSIBLE_DOMAIN) {
			return logger.error("[Plausible]  Specify a domain to use Plausible's event.")
		}
		if (!options.url) {
			return logger.error("[Plausible]  Specify a URL to use Plausible's event.")
		}
		if (!options.name) {
			return logger.error("[Plausible]  Specify a name to use Plausible's event.")
		}

		const temp = {
			name: options.name,
			url: options?.url ?? `https://${this._PLAUSIBLE_DOMAIN}/`,
			domain: options?.domain ?? this._PLAUSIBLE_DOMAIN
		}

		if (options.revenue) {
			const revenue = options.revenue
			// we need the validAmount function to make sure the amount includes decimal points or it wont work.
			Object.assign(temp, { revenue: { currency: revenue.currency, amount: validAmount(revenue.amount) } })
		}

		if (typeof options.data === 'object') {
			if (options.data !== null) {
				if (Object.entries(options.data).length > 30) {
					throw new Error('[Plausible] Cannot send an object with more than 30 fields.')
				} else {
					Object.assign(temp, { props: { ...options.data } })
				}
			}
		}

		const res = await fetch('https://plausible.io/api/event', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36'
			},
			referrer: options.referrer ?? '',
			body: JSON.stringify(temp)
		})

		if (res.status !== 202) {
			throw new Error(`[Plausible] ${res.statusText} ${res.status}`)
		}
	}
}

function validAmount(amount: string | number) {
	if (typeof amount === 'string') {
		const decimal = amount.indexOf('.')
		return decimal !== -1 ? amount + '.00' : amount
	}
	return Number.isInteger(amount) ? amount.toFixed(2) : amount
}
