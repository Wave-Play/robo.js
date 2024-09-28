import { User } from '../events/_start.js'
import { ChatInputApplicationCommandData } from 'discord.js'
import { createCommandConfig, logger } from 'robo.js'
import type { CommandOptions, CommandResult } from 'robo.js'

export const config = createCommandConfig({
	description: 'Create a new user in database',
	options: [
		{
			name: 'name',
			description: 'Name of the user',
			type: 'string'
		},
		{
			name: 'email',
			description: 'Email of the user',
			type: 'string'
		},
		{
			name: 'age',
			description: 'Age of the user',
			type: 'number'
		}
	]
} as const)

export default async (
	_interaction: ChatInputApplicationCommandData,
	options: CommandOptions<typeof config>
): Promise<CommandResult> => {
	const { name, email, age } = options
	const newUser = new User({ name, email, age })
	await newUser.save()
	logger.info('New user created:', newUser)

	return {
		embeds: [
			{
				title: newUser.name!,
				fields: [
					{
						name: 'Email',
						value: String(newUser.email)
					},
					{
						name: 'Age',
						value: String(newUser.age)
					}
				]
			}
		]
	}
}
