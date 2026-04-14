import { Command } from '../../utils/cli-handler.js'
import logs from './logs.js'
import start from './start.js'
import status from './status.js'
import stop from './stop.js'

const command = new Command('cloud')
	.description('Manage your cloud deployments.')
	.option('-h', '--help', 'Shows the available command options')
	.addCommand(logs)
	.addCommand(start)
	.addCommand(status)
	.addCommand(stop)
export default command
