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
		<div>
			<img src="/rocket.png" className="logo" alt="Discord" />
			<h1>Hello, World</h1>
			{channelName ? <h3>#{channelName}</h3> : <h3>{status}</h3>}
			<small>
				Powered by <strong>Robo.js</strong>
			</small>
		</div>
	)
}
