import { createCommandConfig } from 'robo.js'

import { prisma } from '../../events/_start.js'

import type { AutocompleteInteraction, CommandInteraction } from 'discord.js'
import type { CommandOptions, CommandResult } from 'robo.js'

interface User {
	name: string
	email: string
	age: number
}

export const config = createCommandConfig({
	description: 'Fetches user information.',
	options: [
		{
			name: 'name',
			description: 'The name of the user.',
			type: 'string',
			autocomplete: true,
			required: true
		}
	]
} as const)

export const autocomplete = async (interaction: AutocompleteInteraction) => {
	const name = interaction.options.getFocused().trim()

	const users = await prisma.users.findMany({
		take: 25,
		where: {
			name: {
				contains: name,
				mode: 'insensitive'
			}
		}
	})

	return users.map((user) => ({ name: user.name, value: user.name }))
}

export default async (_: CommandInteraction, options: CommandOptions<typeof config>): Promise<CommandResult> => {
	const user = await prisma.users.findFirst({
		where: {
			name: options.name
		}
	})

	if (!user) {
		return {
			content: 'User not found.'
		}
	}

	return {
		embeds: [
			{
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
			}
		]
	}
}
