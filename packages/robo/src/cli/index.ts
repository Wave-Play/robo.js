#!/usr/bin/env node
process.removeAllListeners('warning') // <-- Supresses Fetch API experimental warning
import { Command } from './utils/cli-handler.js'

import { packageJson } from './utils/utils.js'
import build from './commands/build/index.js'
import plugin from './commands/build/plugin.js'
import start from './commands/start.js'
import dev from './commands/dev.js'
import deploy from './commands/deploy.js'
import doctor from './commands/doctor.js'
import invite from './commands/invite.js'
import why from './commands/why.js'
import help from './commands/help.js'

const command = new Command('robo')
export default command

command.description('Elevate your Discord.js bot game to the next level')
command.version(packageJson.version)
command.addCommand(build)
command.addCommand(plugin)
command.addCommand(start)
command.addCommand(dev)
command.addCommand(deploy)
command.addCommand(doctor)
command.addCommand(invite)
command.addCommand(why)
command.addCommand(help)
command.parse()
