#!/usr/bin/env node
process.removeAllListeners('warning') // <-- Supresses Fetch API experimental warning
import { Command } from './utils/cli-handler.js'
import add from './commands/add.js'
import build from './commands/build/index.js'
import deploy from './commands/deploy.js'
import dev from './commands/dev.js'
import doctor from './commands/doctor.js'
import invite from './commands/invite.js'
import remove from './commands/remove.js'
import start from './commands/start.js'
import upgrade from './commands/upgrade.js'
import why from './commands/why.js'
import { packageJson } from './utils/utils.js'

new Command('robo')
	.description('Turbocharge Discord.js with effortless power! ⚡')
	.version(packageJson.version)
	.addCommand(add)
	.addCommand(build)
	.addCommand(deploy)
	.addCommand(dev)
	.addCommand(doctor)
	.addCommand(invite)
	.addCommand(remove)
	.addCommand(start)
	.addCommand(upgrade)
	.addCommand(why)
	.parse()
