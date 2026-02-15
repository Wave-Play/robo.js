import { useState } from 'react'
import { useDiscordSdk } from '../hooks/useDiscordSdk'

export function Activity() {
	const { discordSdk, status, error } = useDiscordSdk()
	const [count, setCount] = useState(0)

	if (error) {
		return (
			<div className="activity">
				<p className="error">Error: {error}</p>
			</div>
		)
	}

	if (status !== 'ready') {
		return (
			<div className="activity">
				<div className="loading">
					<div className="spinner" />
					<p>Loading... ({status})</p>
				</div>
			</div>
		)
	}

	return (
		<div className="activity">
			<header className="header">
				<h1>Mock Activity</h1>
				<p className="channel-info">Channel: {discordSdk.channelId ?? 'N/A'}</p>
			</header>
			<main className="main">
				<div className="counter-section">
					<h3>Counter</h3>
					<div className="counter">
						<button className="counter-btn" onClick={() => setCount((c) => c - 1)}>
							-
						</button>
						<span className="counter-value">{count}</span>
						<button className="counter-btn" onClick={() => setCount((c) => c + 1)}>
							+
						</button>
					</div>
				</div>
			</main>
			<footer className="footer">
				<small>
					Powered by <strong>Robo.js</strong> + <strong>@robojs/mock</strong>
				</small>
			</footer>
		</div>
	)
}
