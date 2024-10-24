import React, { useEffect } from 'react'
import { useSyncState, useSyncBroadcast, useSyncContext } from '@robojs/sync'
import GameBoard from './GameBoard' // Ensure you import GameBoard

export function MultiplayerGame() {
	const initialGameState = {
		players: []
		// Add other game state properties as needed
	}

	const [gameState, setGameState, syncContext] = useSyncState(initialGameState, ['gameRoom'])
	const { clients, clientId, isHost } = syncContext

	const { broadcast } = useSyncBroadcast(
		(action, context) => {
			console.log(`${context.clientId} performed action: `, action)
			setGameState((prevState) => ({ ...prevState, ...action }))
		},
		['gameRoom']
	)

	useSyncContext(
		{
			onConnect: (client) => console.log(`${client.id} has joined`),
			onDisconnect: (client) => console.log(`${client.id} has left`)
		},
		['gameRoom']
	)

	useEffect(() => {
		if (isHost) {
			console.log('You are the host!')
		}
	}, [isHost])

	const handlePlayerAction = (action) => {
		setGameState((prevState) => ({ ...prevState, ...action }))
		broadcast(action)
	}

	return (
		<div>
			<GameBoard state={gameState} onAction={handlePlayerAction} />
			<div>Connected Players: {clients.length}</div>
		</div>
	)
}
