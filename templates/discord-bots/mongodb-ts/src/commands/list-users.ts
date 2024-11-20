import { User } from '../events/_start.js'
import { createCommandConfig, logger } from 'robo.js'
import type { ChatInputCommandInteraction } from 'discord.js'
import type { CommandOptions, CommandResult } from 'robo.js'

export const config = createCommandConfig({
	description: 'List all users in database',
	options: [
		{
			name: 'limit',
			description: 'Number of users to list',
			max: 10,
			min: 3,
			type: 'number'
		}
	]
} as const)

export default async (
	_interaction: ChatInputCommandInteraction,
	options: CommandOptions<typeof config>
): Promise<CommandResult> => {
	// Find first 5
	const users = await User.find().limit(5)
	logger.info(`Users:`, users)

	return {
		embeds: users.map((user) => ({
			title: user.name!,
			fields: [
				{
					name: 'Email',
					value: String(user.email)
				},
				{
					name: 'Age',
					value: String(user.age)
				}
			]
		}))
	}
}
