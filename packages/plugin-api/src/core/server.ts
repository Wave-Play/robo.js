import { _readyPromise } from './plugin-utils.js'
import { getPluginOptions } from 'robo.js'
import type { BaseEngine } from '~/engines/base.js'
import type { PluginConfig } from '~/events/_start.js'

/**
 * Use this to interact with the server.
 */
export const Server = { config, get, ready }

// Reference to config provided to the plugin.
let _config: PluginConfig

function config() {
	return _config ?? getPluginOptions('@robojs/server')
}

// Reference to internal engine used.
let _engine: BaseEngine

function get() {
	return globalThis.roboServer?.engine ?? _engine
}

/**
 * Returns a promise that resolves when the server is all set up.
 */
function ready() {
	return _readyPromise
}

// WARNING: Do not expose to user.
export function setConfig(config: PluginConfig) {
	_config = config
}

// WARNING: Do not expose to user.
export function setEngine(engine: BaseEngine) {
	_engine = engine
}
