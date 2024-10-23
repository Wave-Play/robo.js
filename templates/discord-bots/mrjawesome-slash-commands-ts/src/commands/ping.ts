import { createCommandConfig } from 'robo.js'

export const config = createCommandConfig({
	description: 'Replies with Pong!'
} as const)

export default () => {
	return 'Pong!'
}
