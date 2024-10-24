import React from 'react'
import { SyncProvider } from '@robojs/sync'
import { MultiplayerGame } from './components/MultiplayerGame' // Adjust path if needed

function App() {
	return (
		<SyncProvider>
			<MultiplayerGame />
		</SyncProvider>
	)
}

export default App
