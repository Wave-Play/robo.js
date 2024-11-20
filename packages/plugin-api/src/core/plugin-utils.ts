import { pluginOptions } from '~/events/_start.js'
import type { BaseEngine } from '~/engines/base.js'

export let _readyPromiseResolve: () => void

export const _readyPromise = new Promise<void>((resolve) => {
	const interval = setInterval(() => {
		if (globalThis.roboServer?.ready) {
			clearInterval(interval)
			_readyPromiseResolve()
		}
	}, 400)

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
