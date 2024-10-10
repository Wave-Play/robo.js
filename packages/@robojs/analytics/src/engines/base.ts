import { EventOptions, ViewOptions } from '../core/analytics.js'

export abstract class BaseEngine {
	private _domain: string | undefined = undefined
	constructor(domain?: string) {
		this._domain = domain
	}
	public abstract event(options: EventOptions): Promise<void> | void
	public abstract view(page: string, options: ViewOptions): Promise<void> | void
}
