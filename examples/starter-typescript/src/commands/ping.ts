import { CommandConfig } from './../../../../packages/discord/src/types/index'

export const config: CommandConfig = {
	description: 'Replies with Pong!'
}

export default () => {
	return 'Pong!'
}
