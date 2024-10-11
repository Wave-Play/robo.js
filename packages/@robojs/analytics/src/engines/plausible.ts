import { BaseEngine } from './base.js'
import { analyticsLogger } from '../core/loggers.js'
import { color } from 'robo.js'
import type { EventOptions, ViewOptions } from './base.js'

// Constants
const Host = 'https://plausible.io'
const Prefix = color.dim('[Plausible]')

export class PlausibleAnalytics extends BaseEngine {
	private _domain: string

	constructor(domain?: string) {
		super()
		this._domain = domain ?? process.env.PLAUSIBLE_DOMAIN!
		analyticsLogger.ready(color.bold('Plausible'), 'is ready to collect data.')
	}

	public async event(name: string, options: EventOptions): Promise<void> {
		if (!name) {
			return analyticsLogger.error(Prefix, "Specify a name to use Plausible's event.")
		}

		const { data, domain = this._domain } = options ?? {}
		const { url = `https://${domain}/` } = options ?? {}

		// Compose the payload
		const payload = {
			domain,
			name,
			url
		}

		if (data && typeof data === 'object') {
			if (Object.entries(data).length > 30) {
				throw new Error(Prefix + ' Cannot send an object with more than 30 fields.')
			} else {
				Object.assign(payload, { props: { ...data } })
			}
		}

		await this.collect(payload)
	}

	public async view(page: string, options: ViewOptions): Promise<void> {
		const { data, domain = this._domain, url = `https://${this._domain}/${slugify(page)}` } = options ?? {}

		// Compose the payload
		const payload = {
			name: 'pageview',
			url: url,
			domain: domain
		}

		if (data && typeof data === 'object') {
			if (Object.entries(data).length > 30) {
				throw new Error(Prefix + ' Cannot send an object with more than 30 fields.')
			} else {
				Object.assign(payload, { props: { ...data } })
			}
		}

		await this.collect(payload)
	}

	private async collect(payload: unknown) {
		const res = await fetch(Host + '/api/event', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-Forwarded-For': '127.0.0.1',
				'User-Agent':
					'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.121 Safari/537.36 OPR/71.0.3770.284'
			},
			body: JSON.stringify(payload)
		})

		try {
			if (!res.ok) {
				throw new Error(Prefix + ` ${res.statusText} ${res.status}`)
			} else {
				analyticsLogger.debug(Prefix, `Event was sent successfully.`)
			}
		} catch (error) {
			analyticsLogger.warn(Prefix, error)
		}
	}
}

function slugify(value: string): string {
	return value
		.normalize('NFKD') // Normalize the string to decompose characters
		.replace(/[\u0300-\u036f]/g, '') // Remove diacritical marks
		.replace(/[^a-zA-Z0-9\s-]/g, '') // Remove non-alphanumeric characters except spaces and hyphens
		.trim() // Trim whitespace from both ends
		.replace(/[\s-]+/g, '-') // Replace spaces and hyphens with a single hyphen
		.toLowerCase() // Convert to lowercase
}

/*function validAmount(amount: string | number) {
	if (typeof amount === 'string') {
		const decimal = amount.indexOf('.')
		return decimal !== -1 ? amount + '.00' : amount
	}
	return Number.isInteger(amount) ? amount.toFixed(2) : amount
}*/
