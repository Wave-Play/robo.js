import { Command } from '../../utils/cli-handler.js'
import install from './install.js'
import list from './list.js'
import remove from './remove.js'
import update from './update.js'

const command = new Command('skills')
	.description('Manage AI coding skills from plugins.')
	.handler(listAction)
	.addCommand(install)
	.addCommand(list)
	.addCommand(remove)
	.addCommand(update)
export default command

// Bare `robo skills` defaults to list
async function listAction(context: import('../../../types/cli.js').CliContext) {
	const { listAction: action } = await import('./list.js')
	return action(context)
}
