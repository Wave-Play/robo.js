import { useEffect } from 'react'
import { useDiscordSdk } from '../hooks/useDiscordSdk'
import { trpc, trpcClient } from '../trpc/client'

export const Activity = () => {
	const { authenticated, discordSdk } = useDiscordSdk()
	const { data } = trpc.hello.useQuery({ text: 'World' })
	console.log('React query data:', data)

	useEffect(() => {
		const run = async () => {
			const data = await trpcClient.hello.query({ text: 'World' })
			console.log('tRPC data:', data)
		}
		run()
	}, [authenticated, discordSdk])

	return (
		<div>
			<img src="/rocket.png" className="logo" alt="Discord" />
			<h1>{data?.message || 'Loading...'}</h1>
			<small>
				Powered by <strong>Robo.js</strong>
			</small>
		</div>
	)
}
