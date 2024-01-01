import { Command } from '../../utils/cli-handler.js'
import status from './status.js'

const command = new Command('cloud')
	.addCommand(status)
export default command
