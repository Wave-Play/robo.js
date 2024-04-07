import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
export const packageJson = require('../../../package.json')

export const _PREFIX = '@robojs/ai/'

export const BUTTON_ID = {
	create: _PREFIX + 'button/create',
	discard: _PREFIX + 'button/discard'
}
