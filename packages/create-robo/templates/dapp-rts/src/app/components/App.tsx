import { useEffect, useState } from 'react'
import { DiscordSDK } from '@discord/embedded-app-sdk'
import setupDiscordSdk from '../_auth'
import './../css/App.css'

function App() {
	const [_, setAuth] = useState(null)
	const [counter, setCounter] = useState(49)

	useEffect(() => {
		const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID)

		setupDiscordSdk(discordSdk).then((res: any) => {
			console.log('ready ?')
			setAuth(res)
		})
	}, [])

	return (
		<>
			<div>
				<h1>Welcome to Robo.js</h1>
				<p>
					Edit <code>src/app/App.tsx</code> and save to test HMR and see your app reload in real time
				</p>
			</div>
			<span>{counter}</span>
			<button onClick={() => setCounter((prev) => prev + 1)}>Counter increment</button>
			<p className="read-the-docs">
				<a href="google.com"> Click here </a> to learn more about Robo.js!
			</p>
		</>
	)
}

export default App
