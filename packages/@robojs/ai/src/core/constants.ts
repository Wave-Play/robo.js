/** Shared constants used throughout the AI plugin. */
import { createRequire } from 'node:module'

/** CommonJS require helper for loading package metadata within ESM modules. */
const require = createRequire(import.meta.url)
/** Package metadata for the plugin. */
export const packageJson = require('../../../package.json')

/** Flashcore prefix applied to AI plugin storage keys. */
export const _PREFIX = '@robojs/ai/'

/** Button custom IDs used by the AI plugin's Discord components. */
export const BUTTON_ID = {
	/** Button ID for confirm/create actions. */
	create: _PREFIX + 'button/create',
	/** Button ID for discard/cancel actions. */
	discard: _PREFIX + 'button/discard'
}
