import { createCommandConfig } from 'robo.js'

import { sql } from '../../events/_start.js'

import type { CommandInteraction } from 'discord.js'
import type { CommandOptions, CommandResult } from 'robo.js'

interface User {
    name: string
    email: string
    age: number
}

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

    const newUser = await sql<
        User[]
    >`INSERT INTO users (name, email, age) values (${name}, ${email}, ${age}) returning name, email, age`

    if (!newUser.length) return 'Failed to create user.'

    return {
        embeds: [
            {
                title: newUser[0].name!,
                fields: [
                    {
                        name: 'Email',
                        value: newUser[0].email
                    },
                    {
                        name: 'Age',
                        value: String(newUser[0].age)
                    }
                ]
            }
        ]
    }
}
