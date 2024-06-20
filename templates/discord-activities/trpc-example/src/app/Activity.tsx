import { useEffect } from 'react'
import { useDiscordSdk } from '../hooks/useDiscordSdk'
import { trpc, trpcClient } from '../core/trpc-client'

export const Activity = () => {
	const { authenticated, discordSdk } = useDiscordSdk()
	const hello = trpc.hello.useQuery({ text: 'hai' })
	console.log(hello)

	useEffect(() => {
		const run = async () => {
			const data = trpcClient.hello.query({ text: 'hai' })
			console.log(data)
		}
		run()
	}, [authenticated, discordSdk])

	return (
		<div>
			<img src="/rocket.png" className="logo" alt="Discord" />
			<h1>Hello, World</h1>
			<small>
				Powered by <strong>Robo.js</strong>
			</small>
		</div>
	)
}
