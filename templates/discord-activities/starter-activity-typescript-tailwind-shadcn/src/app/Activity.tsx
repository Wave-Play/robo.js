import { useEffect, useState } from 'react'
import { useDiscordSdk } from '../hooks/useDiscordSdk'

export const Activity = () => {
	const { authenticated, discordSdk, status } = useDiscordSdk()
	const [channelName, setChannelName] = useState<string>()

	useEffect(() => {
		// Requesting the channel in GDMs (when the guild ID is null) requires
		// the dm_channels.read scope which requires Discord approval.
		if (!authenticated || !discordSdk.channelId || !discordSdk.guildId) {
			return
		}

		// Collect channel info over RPC
		// Enable authentication to see it! (App.tsx)
		discordSdk.commands.getChannel({ channel_id: discordSdk.channelId }).then((channel) => {
			if (channel.name) {
				setChannelName(channel.name)
			}
		})
	}, [authenticated, discordSdk])

	return (
		<div className="m-0 flex min-h-screen min-w-80 flex-col place-items-center justify-center">
			<img src="/rocket.png" className="my-4 h-24 duration-300 hover:drop-shadow-[0_0_2em_#646cff]" alt="Discord" />
			<h1 className="my-4 text-5xl font-bold">Hello, World</h1>
			<h3 className="my-4 font-bold">{channelName ? `#${channelName}` : status}</h3>
			<small className="my-4">
				Powered by <strong>Robo.js</strong>
			</small>
		</div>
	)
}
