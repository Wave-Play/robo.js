import { BaseAnalytics } from './analytics'
import { Flashcore } from 'robo.js'

type DiscordEvents = 'slash-commands'

interface User {
	name: string
	id: string
	executed: number
}

interface CommandOptions {
	name: string
	pluginName: string
	guildId: string
	count: number
	user: User
}

interface DiscordEvent {
	name: DiscordEvents
}

export class DiscordAnalytics extends BaseAnalytics {
	public async event(eventName?: DiscordEvent, options?: CommandOptions): Promise<void> {
		if (eventName && options) {
			// get the user

			const user = await Flashcore.get<CommandOptions>(options.user.id, {
				namespace: options.guildId
			})

			if (user) {
				return
			}

			// check if he already has the same command in it

			// if he does increment count

			await Flashcore.set(options.user.id, [options], {
				namespace: options.guildId
			})
		}
	}
}
