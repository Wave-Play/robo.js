import type { BaseConfig, Handler } from './index.js'

export interface Event {
	default: (data: unknown, options?: unknown) => unknown | Promise<unknown>
}

export interface EventRecord extends Handler {
	handler: Event
}

export interface EventConfig extends BaseConfig {
	frequency?: 'always' | 'once'
}
