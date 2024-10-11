import { BaseEngine } from './base.js'
import type { EventOptions, ViewOptions } from './base.js'

export class ManyEngines extends BaseEngine {
	private _engines: BaseEngine[]

	constructor(...engines: BaseEngine[]) {
		super()
		this._engines = engines
	}

	public async event(name: string, options?: EventOptions) {
		await Promise.all(this._engines.map((engine) => engine.event(name, options)))
	}

	public async view(page: string, options?: ViewOptions) {
		await Promise.all(this._engines.map((engine) => engine.view(page, options)))
	}
}
