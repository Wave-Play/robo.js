import { useEffect } from 'react'
import { DiscordSession, useDiscordSdk } from '../hooks/useDiscordSdk'
import { useGodot } from '../hooks/useGodot'
import { DiscordSDK, DiscordSDKMock } from '@discord/embedded-app-sdk'

declare global {
	interface Window {
		discord: {
			sdk: DiscordSDK | DiscordSDKMock
			accessToken: string | null
			session: DiscordSession | null
			status: 'authenticating' | 'error' | 'loading' | 'pending' | 'ready'
		}
	}
}

export const Activity = () => {
	const { discordSdk, status, accessToken, session } = useDiscordSdk()

	useEffect(() => {
		// pass discordSdk to window for use in Godot
		window.discord = {
			sdk: discordSdk,
			accessToken,
			session,
			status
		}

		console.log('set', window.discord)
	}, [discordSdk, status, accessToken, session])

	const { startGame, loading } = useGodot('/Game/Testing', { pck: 1779104, wasm: 43016933 })

	return (
		<div>
			<img src="/Logo.png" className="logo" alt="Logo" />
			<h1>Hello, Godot</h1>
			{loading ? (
				<progress value={typeof loading === 'number' ? loading : undefined} max={100}></progress>
			) : (
				<div className="game">
					<button onClick={() => startGame()}>Start</button>
					<canvas id="godot-canvas" tabIndex={-1} />
				</div>
			)}
			<br />
			<small>
				Powered by <strong>Robo.js</strong>
			</small>
		</div>
	)
}
