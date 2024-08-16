import { BaseAnalytics, EventOptions } from './analytics'
import { Flashcore, logger } from 'robo.js'

export class DiscordAnalytics extends BaseAnalytics {
	public async event(options?: EventOptions): Promise<void> {
		if (options && options.user && options.user.id) {
			let data = [options]
			const user = await Flashcore.get<EventOptions[]>(options.user.id.toString(), {
				namespace: options.id?.toString()
			})

			if (user) {
				const commandExist = user.filter((command) => {
					if (command.label === options.label) {
						return command
					}
				})
				if (commandExist) {
					data = user.map((command) => {
						if (command.label === options.label) {
							return {
								...command,
								numberOfExecution: command.numberOfExecution ? (command.numberOfExecution += 1) : 1
							}
						}
						return command
					})
				} else {
					data = [options, ...user]
				}
			}

			await Flashcore.set(options.user.id.toString(), data, {
				namespace: options.id?.toString()
			})

			logger.error(user)
		}
	}
}
