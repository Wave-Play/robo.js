import { pluginOptions } from '~/events/_start.js'
import type { BaseEngine } from '~/engines/base.js'

export let _readyPromiseResolve: () => void

const _readyPromise = new Promise<void>((resolve) => {
	_readyPromiseResolve = resolve
})

export function getServerEngine<T extends BaseEngine = BaseEngine>() {
	return pluginOptions.engine as T
}

/**
 * Returns a promise that resolves when the plugin is all set up.
 */
export function ready(): Promise<void> {
	return _readyPromise
}
