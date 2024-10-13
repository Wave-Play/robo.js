import { useEffect, useState } from 'react'
import './App.css'

export default function App() {
	const { count, increment } = useCounter()

	return (
		<div>
			<h1>Hello, World</h1>
			<section>
				<button onClick={increment}>Counter: {count}</button>
			</section>
			<small className="powered-by">
				Powered by <a href="https://roboplay.dev/docs">Robo.js</a>
			</small>
		</div>
	)
}

// Simple custom hook to use included APIs for demo purposes
function useCounter() {
	const [count, setCount] = useState(0)

	useEffect(() => {
		const run = async () => {
			const data = await fetch('/api/get-count').then((res) => res.json())
			setCount(data.count)
		}
		run()
	}, [])

	const increment = async () => {
		const data = await fetch('/api/set-count').then((res) => res.json())
		setCount(data.count)
	}

	return { count, increment }
}
