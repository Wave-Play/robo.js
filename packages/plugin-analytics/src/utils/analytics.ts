import { DiscordAnalytics } from './discordAnalytics'

export abstract class BaseAnalytics {
	abstract event(...args: any): Promise<void>
}

type Analytics = BaseAnalytics | undefined | DiscordAnalytics

let _analytics: Analytics

export function setAnalytics(analytics: Analytics) {
	_analytics = Object.freeze(analytics)
}

export const Analytics = {
	event: (...args: any) => _analytics?.event(args)
}
