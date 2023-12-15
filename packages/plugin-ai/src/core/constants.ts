import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
export const packageJson = require('../../../package.json')

export const _PREFIX = '@roboplay/plugin-ai_'

export const BUTTON_ID = {
	create: _PREFIX + 'create',
	discard: _PREFIX + 'discard'
}
