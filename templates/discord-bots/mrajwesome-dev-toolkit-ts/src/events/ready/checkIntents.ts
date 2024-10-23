import checkIntents from '../../utils/checkIntents.js'
import { Client } from 'discord.js'

export default async (client: Client) => checkIntents(client)
