import { logger } from 'robo.js'
import { EventOptions, ViewOptions } from './types'

export const analyticsLogger = logger.fork('analytics')

export abstract class BaseEngine {
	public abstract event(options: EventOptions): Promise<void> | void
	public abstract view(page: string, options: ViewOptions): Promise<void> | void
}

let _analytics: BaseEngine

export function setAnalytics(analytics: BaseEngine) {
	_analytics = Object.freeze(analytics)
}

export const Analytics = Object.freeze({
	event: (options: EventOptions) => _analytics.event(options),
	view: (page: string, options: ViewOptions) => _analytics.view(page, options),
	isReady: () => {
		return _analytics !== undefined
	}
})
