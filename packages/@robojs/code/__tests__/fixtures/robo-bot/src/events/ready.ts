import type { Client } from 'discord.js'

export default function ready(client: Client) {
	console.log(`Logged in as ${client.user?.tag}`)
}
