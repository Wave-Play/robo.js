import type { ContextConfig } from '@roboplay/robo.js'
import type { User, UserContextMenuCommandInteraction } from 'discord.js'

export const config: ContextConfig = {
	description: 'Audit a user',
	dmPermission: false
}

export default (_interaction: UserContextMenuCommandInteraction, user: User) => {
	return user.username + ' is a cat! Meow!'
}
