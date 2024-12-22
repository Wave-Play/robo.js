import { createRequire } from 'node:module'
import { color, composeColors } from 'robo.js'

// Read the version from the package.json file
const require = createRequire(import.meta.url)
export const packageJson = require('../../package.json')

// Default files
export const Files = {
	GitIgnore: {
		Content: `# See https://help.github.com/articles/ignoring-files/ for more about ignoring files.

# robo.js
.robo/*

# dependencies
/node_modules
/.pnp
.pnp.js

# testing
/coverage

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# local env files
.env
.env*.local

# typescript
*.tsbuildinfo
.gitattributes
`,
		Name: '.gitignore'
	}
}

// Pretty logging
export const Highlight = composeColors(color.bold, color.cyan)
export const HighlightBlue = composeColors(color.bold, color.blue)
export const HighlightGreen = composeColors(color.bold, color.green)
export const HighlightMagenta = composeColors(color.bold, color.magenta)
export const HighlightRed = composeColors(color.bold, color.red)
export const Indent = ' '.repeat(3)
