import { createCommandConfig } from 'robo.js'

import { sql } from '../../events/_start.js'

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

    let users
    if (name) {
        users = await sql<
            User[]
        >`SELECT name, age, email FROM users WHERE LOWER(name) LIKE ${name.toLowerCase() + '%'} ORDER BY id LIMIT 25`
    } else {
        users = await sql<User[]>`SELECT name, age, email FROM users ORDER BY id LIMIT 25`
    }

    return users.map((user) => ({ name: user.name, value: user.name }))
}

export default async (_: CommandInteraction, options: CommandOptions<typeof config>): Promise<CommandResult> => {
    const users = await sql<User[]>`SELECT name, age, email FROM users WHERE name = ${options.name}`

    if (!users.length) return 'No user found matching the criteria.'

    return {
        embeds: users.map((user) => {
            return {
                title: user.name!,
                fields: [
                    {
                        name: 'Email',
                        value: user.email
                    },
                    {
                        name: 'Age',
                        value: String(user.age)
                    }
                ]
            }
        })
    }
}
