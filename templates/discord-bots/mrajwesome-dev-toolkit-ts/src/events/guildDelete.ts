import type { Guild } from 'discord.js'

export default (guild: Guild) => {
	console.log(`Left guild ${guild.name} with ${guild.memberCount} members!`)
}
