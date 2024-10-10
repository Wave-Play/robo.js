interface CommonOptions {
	action?: string
	url?: string
	domain?: string
	userId?: number | string
	actionType?: string
	type?: string
	name: string
	data?: unknown
	referrer?: string
	revenue?: { currency: string; amount: number | string }
}

export interface EventOptions extends CommonOptions {}

export interface ViewOptions extends CommonOptions {
	element?: string
	elementId?: string
}
