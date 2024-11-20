import { useEffect, useState } from 'react'
import { useDiscordSdk } from '../hooks/useDiscordSdk'
import './App.css'

export default function ReactApp() {
	const { authenticated, discordSdk, status } = useDiscordSdk()
	const [info, setInfo] = useState<string>(`Current discord status is ${status}`)

	useEffect(() => {
		if (!authenticated || !discordSdk.channelId || !discordSdk.guildId) {
			return
		}
		setInfo(`Current discord status is ${status}`)
		discordSdk.commands.getChannel({ channel_id: discordSdk.channelId }).then((channel) => {
			if (channel.name) {
				setInfo(`You're playing in #${channel.name}`)
			}
		})
	}, [authenticated, discordSdk, status])
	return (
		<div id="info">
			<div>{info}</div>
		</div>
	)
}
