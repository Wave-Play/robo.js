import { logger } from 'robo.js'
import { BaseEngine, EventOptions, ViewOptions } from './analytics'

export class PlausibleAnalytics extends BaseEngine {
	private _PLAUSIBLE_DOMAIN = process.env.PLAUSIBLE_DOMAIN

	public async view(page: string, options: ViewOptions): Promise<void> {
		if (options.name === 'revenue' && typeof options.data === 'object') {
			Object.assign(options, { revenue: { ...options.data } })
		}

		if (options.name === 'props' && typeof options.data === 'object') {
			Object.assign(options, { props: { ...options.data } })
		}
		const temp = {
			...options,
			name: 'pageview',
			url: page,
			domain: options?.domain ?? this._PLAUSIBLE_DOMAIN
		}

		const res = await fetch('https://plausible.io/api/event', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36'
			},
			body: JSON.stringify(temp)
		})

		if (res.status !== 202) {
			throw new Error(`[Plausible] ${res.statusText} ${res.status}`)
		}
	}

	public async event(options?: EventOptions): Promise<void> {
		if (!options) return

		if (options.name === 'pageview') {
			return logger.error(`Please use Analytics.view(${options.name}, ${options}).`)
		}

		if (!options.domain) {
			return logger.error("Specify a domain to use Plausible's event.")
		}
		if (!options.url) {
			return logger.error("Specify a URL to use Plausible's event.")
		}
		if (!options.name) {
			return logger.error("Specify a name to use Plausible's event.")
		}

		if (options.name === 'revenue' && typeof options.data === 'object') {
			Object.assign(options, { revenue: { ...options.data } })
		}

		if (options.name === 'props' && typeof options.data === 'object') {
			Object.assign(options, { props: { ...options.data } })
		}

		const temp = {
			...options,
			domain: options?.domain ?? process.env.PLAUSIBLE_DOMAIN
		}

		const res = await fetch('https://plausible.io/api/event', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/68.0.3440.106 Safari/537.36'
			},
			body: JSON.stringify(temp)
		})

		if (res.status !== 202) {
			throw new Error(`[Plausible] ${res.statusText} ${res.status}`)
		}
	}
}
