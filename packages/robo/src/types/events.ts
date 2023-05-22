import type { BaseConfig } from './index.js'

export interface Event {
	default: (...data: unknown[]) => unknown | Promise<unknown>
}

export interface EventConfig extends BaseConfig {
	frequency?: 'always' | 'once'
}
