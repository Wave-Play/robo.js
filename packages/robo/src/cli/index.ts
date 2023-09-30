#!/usr/bin/env node
process.removeAllListeners('warning') // <-- Supresses Fetch API experimental warning
import { Command } from './utils/cli-handler.js'
import { packageJson } from './utils/utils.js'
import add from './commands/add.js'
import build from './commands/build/index.js'
import dev from './commands/dev.js'
import deploy from './commands/deploy.js'
import doctor from './commands/doctor.js'
import invite from './commands/invite.js'
import remove from './commands/remove.js'
import start from './commands/start.js'
import upgrade from './commands/upgrade.js'
import why from './commands/why.js'
import help, { helpCommandHandler } from './commands/help.js'

const command = new Command('robo')
export default command

command.description('Turbocharge Discord.js with effortless power! ⚡')
command.version(packageJson.version)
command.addCommand(build)
command.addCommand(start)
command.addCommand(dev)
command.addCommand(add)
command.addCommand(remove)
command.addCommand(upgrade)
command.addCommand(deploy)
command.addCommand(doctor)
command.addCommand(invite)
command.addCommand(why)
command.addCommand(help)
command.handler(helpCommandHandler)
command.parse()
