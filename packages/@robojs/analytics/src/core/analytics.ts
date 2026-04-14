import type { BaseEngine, EventOptions, ViewOptions } from '../engines/base.js'

let _analytics: BaseEngine

export function setAnalytics(analytics: BaseEngine) {
	_analytics = Object.freeze(analytics)
}

export const Analytics = Object.freeze({
	event: (name: string, options?: EventOptions) => _analytics.event(name, options),
	view: (page: string, options?: ViewOptions) => _analytics.view(page, options),
	isReady: () => {
		return _analytics !== undefined
	},
	getEngineInfo: () => {
		if (!_analytics) return null
		const engines = (_analytics as BaseEngine & { _engines?: BaseEngine[] })._engines
		if (Array.isArray(engines)) {
			return {
				type: 'many' as const,
				engines: engines.map((e) => e.constructor.name)
			}
		}
		return { type: 'single' as const, name: _analytics.constructor.name }
	}
})
