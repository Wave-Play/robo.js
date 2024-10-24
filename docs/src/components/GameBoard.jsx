// src/components/GameBoard.jsx
import React from 'react'

const GameBoard = ({ state, onAction }) => {
	// Render the game board based on the state
	return (
		<div>
			{/* Render game elements based on state */}
			<h1>Game Board</h1>
			<button onClick={() => onAction({ type: 'SOME_ACTION' })}>Perform Action</button>
		</div>
	)
}

export default GameBoard
