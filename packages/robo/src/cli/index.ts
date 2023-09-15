#!/usr/bin/env node
process.removeAllListeners('warning') // <-- Supresses Fetch API experimental warning
import { Command } from './utils/cli-handler.js'
import add from './commands/add.js'
import build from './commands/build/index.js'
import deploy from './commands/deploy.js'
import dev from './commands/dev.js'
import doctor from './commands/doctor.js'
import invite from './commands/invite.js'
import start from './commands/start.js'
import why from './commands/why.js'
import { packageJson } from './utils/utils.js'

new Command('robo')
	.description('Elevate your Discord.js bot game to the next level')
	.version(packageJson.version)
	.addCommand(add)
	.addCommand(build)
	.addCommand(deploy)
	.addCommand(dev)
	.addCommand(doctor)
	.addCommand(invite)
	.addCommand(start)
	.addCommand(why)
	.parse()
