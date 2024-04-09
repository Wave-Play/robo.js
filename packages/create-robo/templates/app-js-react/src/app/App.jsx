import './App.css'
import { useDiscordSdk } from './discord-sdk'
// import { useDiscordAuth, useDiscordSdk } from './discord-sdk'

export default function App() {
	const { ready } = useDiscordSdk()
	console.log(`SDK Ready:`, ready)

	// 🔒 Replace useDiscordSdk with this to enable authentication
	// const { authenticated } = useDiscordAuth()
	// console.log(`Authenticated:`, authenticated)

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
