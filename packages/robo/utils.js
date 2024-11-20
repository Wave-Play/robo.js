export { color, composeColors } from './dist/core/color.js'
export { cleanTempDir, getTempDir } from './dist/cli/utils/utils.js'
export { extractCommandOptions } from './dist/core/handlers.js'

import { Env } from './dist/core/env.js'

/**
 * @deprecated Use `Env.load()` instead.
 */
export async function loadEnv() {
	return Env.load()
}
