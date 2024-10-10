#!/usr/bin/env node
process.removeAllListeners('warning') // <-- Supresses Fetch API experimental warning
import { Command } from './utils/cli-handler.js'
import { packageJson } from './utils/utils.js'
import add from './commands/add.js'
import build from './commands/build/index.js'
import cloud from './commands/cloud/index.js'
import dev from './commands/dev.js'
import deploy from './commands/deploy.js'
import invite from './commands/invite.js'
import login from './commands/login.js'
import logout from './commands/logout.js'
import remove from './commands/remove.js'
import start from './commands/start.js'
import sync from './commands/sync.js'
import upgrade from './commands/upgrade.js'
import why from './commands/why.js'
import help, { helpCommandHandler } from './commands/help.js'

const command = new Command('robo')
export default command

command.description('Power up Discord with effortless activities, bots, web servers, and more! ⚡')
command.version(packageJson.version)
command.addCommand(build)
command.addCommand(start)
command.addCommand(dev)
command.addCommand(add)
command.addCommand(remove)
command.addCommand(sync)
command.addCommand(upgrade)
command.addCommand(deploy)
command.addCommand(invite)
command.addCommand(cloud)
command.addCommand(login)
command.addCommand(logout)
command.addCommand(why)
command.addCommand(help)
command.handler(helpCommandHandler)
command.parse()
