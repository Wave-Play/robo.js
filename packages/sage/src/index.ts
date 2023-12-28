#!/usr/bin/env node
import { Command } from 'commander'
import { createRequire } from 'node:module'
import doctorCommand from './commands/doctor.js'
import exportCommand from './commands/export.js'
import importCommand from './commands/import.js'
import upgradeCommand from './commands/upgrade.js'
import whyCommand from './commands/why.js'
import typescriptCommand from './commands/typescript.js'
import generateCommand from './commands/generate.js'

// Read the version from the package.json file
const require = createRequire(import.meta.url)
export const packageJson = require('../package.json')

new Command('@roboplay/sage')
	.description('Codemod for Robo.js')
	.version(packageJson.version)
	.addCommand(doctorCommand)
	.addCommand(exportCommand)
	.addCommand(importCommand)
	.addCommand(upgradeCommand)
	.addCommand(whyCommand)
	.addCommand(typescriptCommand)
	.addCommand(generateCommand)
	.parse(process.argv)
