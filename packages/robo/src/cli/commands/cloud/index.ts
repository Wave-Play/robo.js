import { Command } from '../../utils/cli-handler.js'
import start from './start.js'
import status from './status.js'
import stop from './stop.js'

const command = new Command('cloud').addCommand(start).addCommand(status).addCommand(stop)
export default command
