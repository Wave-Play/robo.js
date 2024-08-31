import { BaseEngine, EventOptions, ViewOptions } from './analytics'

export class DiscordAnalytics extends BaseEngine {
	public async view(page: string, options: ViewOptions): Promise<void> {
		throw new Error('Method not implemented.')
	}
	public async event(options?: EventOptions): Promise<void> {
		throw new Error('Method not implemented.')
	}
}
