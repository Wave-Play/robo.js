export interface EventOptions {
	action?: string
	actionType?: string
	data?: unknown
	domain?: string
	label?: string
	name?: string
	referrer?: string
	revenue?: { currency: string; amount: number | string }
	sessionId?: string
	type?: string
	url?: string
	userId?: number | string
}

export interface ViewOptions extends EventOptions {
	element?: string
	elementId?: string
}

export abstract class BaseEngine {
	constructor() {}

	public abstract event(name: string, options?: EventOptions): Promise<void> | void

	public abstract view(page: string, options?: ViewOptions): Promise<void> | void
}
