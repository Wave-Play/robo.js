import { createCommandConfig } from '@robojs/discordjs'

export const config = createCommandConfig({
	description: 'Replies with Pong!'
})

export default () => {
	return 'Pong! 🏓'
}
