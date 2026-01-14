/**
 * Change application tools for @robojs/code SDK
 */

export { applyChangesTool, applyChangesSchema, type ApplyChangesInput, type ApplyChangesOutput } from './apply.js'

/**
 * All change tools
 */
import { applyChangesTool } from './apply.js'

export const changeTools = [applyChangesTool]
