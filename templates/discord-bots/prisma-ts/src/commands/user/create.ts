import { createCommandConfig } from 'robo.js'

import { prisma } from '../../events/_start.js'

import type { CommandInteraction } from 'discord.js'
import type { CommandOptions, CommandResult } from 'robo.js'

export const config = createCommandConfig({
	description: 'Adds a user to the database.',
	options: [
		{
			name: 'name',
			description: 'The name of the user.',
			type: 'string',
			required: true
		},
		{
			name: 'age',
			description: 'The age of the user.',
			type: 'integer',
			required: true
		},
		{
			name: 'email',
			description: 'The email of the user.',
			type: 'string',
			required: true
		}
	]
} as const)

export default async (_: CommandInteraction, options: CommandOptions<typeof config>): Promise<CommandResult> => {
	const { name, email, age } = options

	const newUser = await prisma.users.create({
		data: {
			name,
			email,
			age
		}
	})

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
