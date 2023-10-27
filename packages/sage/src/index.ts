#!/usr/bin/env node
import { Command } from 'commander'
import { createRequire } from 'node:module'
import exportCommand from './commands/export.js'
import importCommand from './commands/import.js'
import upgradeCommand from './commands/upgrade.js'
import whyCommand from './commands/why.js'

// Read the version from the package.json file
const require = createRequire(import.meta.url)
export const packageJson = require('../package.json')

// TODO:
// - Verify codemod version before running each command
new Command('@roboplay/sage')
	.description('Codemod for Robo.js')
	.version(packageJson.version)
	.addCommand(exportCommand)
	.addCommand(importCommand)
	.addCommand(upgradeCommand)
	.addCommand(whyCommand)
	.parse(process.argv)
