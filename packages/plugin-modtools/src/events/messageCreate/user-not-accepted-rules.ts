import { ChannelType, GuildMember, TextBasedChannel } from 'discord.js'
import { client, Flashcore } from 'robo.js'

export default async (interaction: any) => {
	if (interaction.author.bot) return

	if (interaction.channel.type === ChannelType.DM) {
		return
	}

	const member = interaction.member as GuildMember
	const rolestring = await Flashcore.get(`member-role`, { namespace: `${interaction.guild.id}` })

	if (member.roles.cache.some((role) => role.name === rolestring) || member.permissions.has('Administrator')) {
		return
	} else {
		const guild = interaction.guild
		const channelId = interaction.channel.id
		const channel = guild.channels.cache.get(`${channelId}`) as TextBasedChannel
		const userid = interaction.author.id
		const channelid = await Flashcore.get(`rules-channel`, { namespace: `${interaction.guild.id}` })
		const channel1 = guild.channels.cache.get(`${channelid}`) as TextBasedChannel

		if (!channel1 || !channel1.isTextBased) {
			console.log('Channel not found or is not a text channel')
			return
		}
		try {
			await client.users.send(
				`${userid}`,
				`You cant send messages untill you accept the rules! go here to accept ${channel1}`
			)
		} catch (error) {
			console.log(`dming the user failed: ` + error)
		}

		const message = await channel.messages.fetch(interaction.id)
		message
			.delete()
			.then((msg) => console.log(`Deleted message from ${msg.author.username}`))
			.catch(console.error)

		return
	}
}
