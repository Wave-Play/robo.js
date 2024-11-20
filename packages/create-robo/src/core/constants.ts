import { createRequire } from 'node:module'
import { color, composeColors } from 'robo.js'

// Read the version from the package.json file
const require = createRequire(import.meta.url)
export const packageJson = require('../../package.json')

// Pretty logging
export const Highlight = composeColors(color.bold, color.cyan)
export const HighlightBlue = composeColors(color.bold, color.blue)
export const HighlightGreen = composeColors(color.bold, color.green)
export const HighlightMagenta = composeColors(color.bold, color.magenta)
export const HighlightRed = composeColors(color.bold, color.red)
export const Indent = ' '.repeat(3)
