import { pluginOptions } from '~/events/_start.js'
import type { BaseEngine } from '~/engines/base.js'

export function getServerEngine<T extends BaseEngine = BaseEngine>() {
	return pluginOptions.engine as T
}
