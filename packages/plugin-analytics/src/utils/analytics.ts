export interface EventOptions {
	category?: string
	label?: string
	numberOfExecution?: number
	user?: userData
	id?: number | string
}

interface userData {
	name?: string
	id?: string | number
	email?: string
}

export abstract class BaseAnalytics {
	abstract event(options: EventOptions): Promise<void>
}

let _analytics: BaseAnalytics

export function setAnalytics(analytics: BaseAnalytics) {
	_analytics = Object.freeze(analytics)
}

export const Analytics = {
	event: (options: EventOptions) => _analytics?.event(options)
}
