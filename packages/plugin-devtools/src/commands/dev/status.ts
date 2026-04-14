/**
 * /dev status - View the status of this Robo
 */
import { Colors, EmbedBuilder } from 'discord.js'
import type { ChatInputCommandInteraction } from 'discord.js'

interface CommandConfig {
	description: string
	sage?: {
		defer?: boolean
		ephemeral?: boolean
	}
}

export const config: CommandConfig = {
	description: 'View the status of this Robo',
	sage: {
		defer: true,
		ephemeral: true
	}
}

export default async function (_interaction: ChatInputCommandInteraction) {
	const uptime = process.uptime()
	const hours = Math.floor(uptime / 3600)
	const minutes = Math.floor((uptime % 3600) / 60)
	const seconds = Math.floor(uptime % 60)

	const memoryUsage = process.memoryUsage()
	const heapUsed = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2)
	const heapTotal = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2)

	// Try to get guild count if Discord client is available
	let guildCount: number | null = null
	try {
		const discordjs = require('@robojs/discordjs')
		if (discordjs?.hasClient?.()) {
			const client = discordjs.getClient()
			guildCount = client.guilds.cache.size
		}
	} catch {
		// Plugin not available
	}

	const fields = [
		{ name: 'Uptime', value: `${hours}h ${minutes}m ${seconds}s`, inline: true },
		{ name: 'Memory', value: `${heapUsed}MB / ${heapTotal}MB`, inline: true },
		{ name: 'Node.js', value: process.version, inline: true }
	]

	if (guildCount !== null) {
		fields.push({ name: 'Guilds', value: String(guildCount), inline: true })
	}

	const embed = new EmbedBuilder()
		.setTitle('Robo Status')
		.setColor(Colors.Green)
		.addFields(fields)
		.setTimestamp()

	return { embeds: [embed] }
}
