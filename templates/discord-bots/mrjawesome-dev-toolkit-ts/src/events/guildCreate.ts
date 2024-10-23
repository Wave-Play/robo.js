import type { Guild } from 'discord.js'

export default (guild: Guild) => {
	console.log(`Joined guild ${guild.name} with ${guild.memberCount} members!`)
}
