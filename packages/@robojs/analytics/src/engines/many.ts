import { BaseEngine } from '../core/analytics.js'
import type { EventOptions, ViewOptions } from '../core/types.js'

export class ManyEngines extends BaseEngine {
	private _engines: BaseEngine[]
	constructor(...engines: BaseEngine[]) {
		super()
		this._engines = engines
	}
	public async event(options: EventOptions) {
		await Promise.all(this._engines.map((engine) => engine.event(options)))
	}
	public async view(page: string, options: ViewOptions) {
		await Promise.all(this._engines.map((engine) => engine.view(page, options)))
	}
}
